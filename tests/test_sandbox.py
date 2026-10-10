"""Secrets isolation: repo code (pip, pytest, probes) never sees the agent's keys or the GitHub token."""
import ast
import json
import os
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
        repo_mod.prepare("https://github.com/a/b", tmp_path / "workspace", "codefix/b")
    assert ".git/config" in str(e.value) and TOKEN not in str(e.value)


@pytest.mark.real_env  # the real venv build (pip) is one of the places repo code runs
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

    state = pipeline.run(bare.as_uri(), "add double(x)", run_id="leak", task_type="feature")
    assert state["status"] == "success", state["result"]["error"]
    assert "pytest (installed package)" in state["result"]["import_check"]  # the venv probe ran too

    for name in ("conftest", "test"):
        text = (dumps / f"{name}.json").read_text(encoding="utf-8")
        seen = json.loads(text)
        assert KEY not in text and TOKEN not in text and "canary" not in text
        assert "origin" in seen["git_config"]  # it really read the clone's config
        assert seen["env"]["PYTHONDONTWRITEBYTECODE"] == "1" and seen["env"]["PIP_NO_INPUT"] == "1"
        assert not [k for k in seen["env"] if sandbox._denied(k)]
    home = tmp_path / "codefix_home"
    assert TOKEN not in (home / "projects" / state["project_id"] / "workspace" / ".git" / "config").read_text(encoding="utf-8")
    # nor in anything the run stored: the database, the run state, the report, the venv marker
    stored = [p for p in home.rglob("*") if p.is_file() and "workspace" not in p.parts and "site-packages" not in p.parts
              and p.suffix not in (".exe", ".pyd", ".dll", ".so")]
    assert any(p.name == "codefix.sqlite" for p in stored) and any(p.name == "state.json" for p in stored)
    for path in stored:
        data = path.read_bytes()
        assert KEY.encode() not in data and TOKEN.encode() not in data, path


def test_git_in_a_workspace_runs_no_repo_hook_and_carries_no_secret(secrets, tmp_path, monkeypatch):
    """Repo tests can write .git/hooks and .git/config; the git commands we run afterwards must not hand them our secrets."""
    repo, dump = tmp_path / "ws", tmp_path / "hook_ran.txt"
    repo.mkdir()
    (repo / "a.txt").write_text("1\n")
    repo_mod.git(["init", "-q"], cwd=repo)
    repo_mod.commit(repo, "first")
    for name in ("pre-commit", "post-commit", "post-checkout", "reference-transaction"):
        hook = repo / ".git" / "hooks" / name
        hook.write_text(f"#!/bin/sh\nenv > '{dump.as_posix()}'\n", newline="\n")
        hook.chmod(0o755)
    repo_mod.set_token(TOKEN)
    try:
        (repo / "a.txt").write_text("2\n")
        repo_mod.commit(repo, "second")
        (repo / "a.txt").write_text("3\n")
        repo_mod.revert(repo)
    finally:
        repo_mod.set_token("")
    assert not dump.exists()  # no hook ran
    # and if some other planted program did run, there is nothing for it to find
    seen = []
    monkeypatch.setattr(sandbox, "_run", lambda cmd, cwd, timeout, env: seen.append((cmd, env)))
    sandbox.run_trusted_git(["status"], repo, TOKEN)
    sandbox.run_trusted_git(["push", "origin", "x"], repo, TOKEN)
    (_, local_env), (push_cmd, push_env) = seen
    assert "GH_TOKEN" not in local_env and KEY not in local_env.values() and TOKEN not in local_env.values()
    assert push_env["GH_TOKEN"] == TOKEN and KEY not in push_env.values()  # the LLM key never reaches git at all
    assert f"core.hooksPath={os.devnull}" in push_cmd
