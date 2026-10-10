"""Secrets isolation: repo code (pip, pytest, probes) never sees the agent's keys or the GitHub token."""
import ast
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from agent import pipeline, sandbox
from agent import repo as repo_mod

ROOT = Path(__file__).parent.parent
FIXTURES = ROOT / "tests" / "fixtures"
KEY = "test-secret-value"
TOKEN = "gho_" + "y" * 36


@pytest.fixture
def secrets(monkeypatch):
    """A parent process full of secrets, as on a developer's machine with .env loaded and a sign-in."""
    monkeypatch.setenv("GEMINI_API_KEY", KEY)
    monkeypatch.setenv("OPENAI_API_KEY", KEY)
    monkeypatch.setenv("GH_TOKEN", TOKEN)
    monkeypatch.setenv("GITHUB_TOKEN", TOKEN)
    monkeypatch.setenv("UNLISTED_SETTING", "canary")
    repo_mod.set_token(TOKEN)
    repo_mod.bind_token(TOKEN)
    yield
    repo_mod.set_token("")
    del repo_mod._bound.token


def test_allowlist_drops_everything_else(secrets):
    env = sandbox.untrusted_env()
    assert "PATH" in {k.upper() for k in env}  # allowlisted, passes
    assert "UNLISTED_SETTING" not in env  # harmless name, still dropped: allowlist, not denylist
    assert not {"GEMINI_API_KEY", "OPENAI_API_KEY", "GH_TOKEN", "GITHUB_TOKEN"} & set(env)
    assert KEY not in env.values() and TOKEN not in env.values()


def test_allowlist_ignores_case(monkeypatch):
    monkeypatch.setenv("tz", "UTC")  # os.environ upper-cases on Windows, keeps the case elsewhere
    assert {k.upper(): v for k, v in sandbox.untrusted_env().items()}["TZ"] == "UTC"


@pytest.mark.parametrize("name", ["API_KEY", "my_token", "Db_Password", "CLIENT_SECRET", "GIT_CREDENTIALS",
                                  "GITHUB_ACTOR", "gh_host", "GEMINI_MODEL", "GOOGLE_CLOUD_PROJECT", "XAI_BASE",
                                  "OPENAI_ORG", "ANTHROPIC_BASE_URL", "FIREBASE_CONFIG", "AWS_PROFILE"])
def test_denylist_beats_extra_env(name):
    env = sandbox.untrusted_env({name: "x", "HARMLESS": "kept"})
    assert name not in env and env["HARMLESS"] == "kept"


def test_denylist_beats_the_allowlist(monkeypatch):
    monkeypatch.setattr(sandbox, "ALLOW", sandbox.ALLOW | {"GEMINI_API_KEY"})  # someone widens it by mistake
    monkeypatch.setenv("GEMINI_API_KEY", KEY)
    assert KEY not in sandbox.untrusted_env().values()


def test_fixed_values_are_always_present():
    env = sandbox.untrusted_env({"PIP_NO_INPUT": "0", "PYTHONIOENCODING": "latin-1"})
    assert env["PIP_NO_INPUT"] == "1" and env["PYTHONIOENCODING"] == "utf-8"
    assert env["GIT_TERMINAL_PROMPT"] == "0" and env["PYTHONDONTWRITEBYTECODE"] == "1"


def test_run_untrusted_child_really_gets_the_clean_environment(secrets, tmp_path):
    p = sandbox.run_untrusted([sys.executable, "-c", "import os, json; print(json.dumps(dict(os.environ)))"],
                              tmp_path, 60, extra_env={"EXTRA": "1", "EXTRA_TOKEN": TOKEN})
    assert p.returncode == 0, p.stderr
    assert KEY not in p.stdout and TOKEN not in p.stdout and "canary" not in p.stdout
    child = json.loads(p.stdout)
    assert child["EXTRA"] == "1" and child["PIP_NO_INPUT"] == "1"


def test_run_untrusted_times_out(tmp_path):
    with pytest.raises(sandbox.TimeoutExpired):
        sandbox.run_untrusted([sys.executable, "-c", "import time; time.sleep(30)"], tmp_path, 1)


def test_only_sandbox_touches_subprocess():
    """Every process the agent starts goes through agent/sandbox.py, so no call site can forget the rules."""
    offenders = []
    for path in sorted((ROOT / "agent").rglob("*.py")):
        if path.name == "sandbox.py":
            continue
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            imported = (isinstance(node, ast.Import) and any(a.name.split(".")[0] == "subprocess" for a in node.names)
                        or isinstance(node, ast.ImportFrom) and (node.module or "").split(".")[0] == "subprocess")
            used = isinstance(node, ast.Name) and node.id == "subprocess"
            # os.system / os.popen / os.spawn* / os.exec* would be the same hole under another name
            shell = (isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) and node.value.id == "os"
                     and node.attr.startswith(("system", "popen", "spawn", "exec", "startfile")))
            if imported or used or shell:
                offenders.append(f"{path.relative_to(ROOT).as_posix()}:{node.lineno}")
    assert offenders == []


def test_clone_that_stores_the_token_is_refused(secrets, tmp_path, monkeypatch):
    def fake_git(args, cwd, check=True):  # a clone that (wrongly) persists the credential
        if args[0] == "clone":
            (Path(args[-1]) / ".git").mkdir(parents=True)
            (Path(args[-1]) / ".git" / "config").write_text(f"[remote]\n\turl = https://x:{TOKEN}@github.com/a/b\n")
        return ""

    monkeypatch.setattr(repo_mod, "git", fake_git)
    with pytest.raises(RuntimeError) as e:
        repo_mod.prepare("https://github.com/a/b", tmp_path, "r1")
    assert ".git/config" in str(e.value) and TOKEN not in str(e.value)


def test_repo_code_sees_no_secret_end_to_end(secrets, tmp_path, monkeypatch):
    """Clone a repo whose conftest.py and test dump os.environ and .git/config, run the whole pipeline, read the dump."""
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.setenv("FAKE_LLM_FILE", str(FIXTURES / "fake_llm_env_dump.json"))
    monkeypatch.setenv("AGENT_OUTPUT_DIR", str(tmp_path / "agent_output"))
    dumps, seed, bare = tmp_path / "dumps", tmp_path / "seed", tmp_path / "origin.git"
    dumps.mkdir()
    shutil.copytree(FIXTURES / "env_dump_repo", seed, ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache"))
    (seed / "dump_path.txt").write_text(str(dumps), encoding="utf-8")  # the only channel to the child: a file
    git = lambda cwd, *a: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *a], cwd=cwd,
                                         capture_output=True, text=True, timeout=60)
    git(seed, "init", "-q", "-b", "main"), git(seed, "add", "-A"), git(seed, "commit", "-q", "-m", "init")
    git(tmp_path, "clone", "-q", "--bare", str(seed), str(bare))

    state = pipeline.run(bare.as_uri(), "add double(x)", runs_dir=tmp_path / "runs", run_id="leak", task_type="feature")
    assert state["status"] == "success", state["result"]["error"]
    assert "pytest (installed package)" in state["result"]["import_check"]  # the venv probe ran too

    for name in ("conftest", "test"):
        text = (dumps / f"{name}.json").read_text(encoding="utf-8")
        seen = json.loads(text)
        assert KEY not in text and TOKEN not in text and "canary" not in text
        assert "origin" in seen["git_config"]  # it really read the clone's config
        assert seen["env"]["PYTHONDONTWRITEBYTECODE"] == "1" and seen["env"]["PIP_NO_INPUT"] == "1"
        assert not [k for k in seen["env"] if sandbox._denied(k)]
    assert TOKEN not in (tmp_path / "runs" / "leak" / "repo" / ".git" / "config").read_text(encoding="utf-8")
