"""End-to-end pipeline tests, offline, with the scripted fake LLM. Slow: each builds a real venv."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from agent import pipeline

ROOT = Path(__file__).parent.parent
SAMPLE = ROOT / "sample_repo"
FAKE = json.loads((ROOT / "tests" / "fake_llm_tinyauth.json").read_text(encoding="utf-8"))
TASK = "login fails when the email has capital letters"


@pytest.fixture(autouse=True)
def fake_llm(monkeypatch, tmp_path):
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.delenv("FAKE_LLM_FILE", raising=False)
    monkeypatch.setenv("MAX_ATTEMPTS", "2")
    monkeypatch.setenv("AGENT_OUTPUT_DIR", str(tmp_path / "agent_output"))  # never write to the real folder


def git_status(repo):
    return subprocess.run(["git", "status", "--porcelain"], cwd=repo, capture_output=True, text=True, timeout=60).stdout


def test_login_case(tmp_path):
    """The judge case: fix the bug, add a test, break nothing."""
    state = pipeline.run(SAMPLE, TASK, runs_dir=tmp_path, run_id="judge")
    r, repo = state["result"], tmp_path / "judge" / "repo"

    assert state["status"] == "success", r["error"]
    assert [s["name"] for s in state["steps"]][-4:] == ["edit #1", "reproduce #1", "verify #1", "report"]
    assert r["task_type"] == "debug" and r["reproduced"] is True  # the new test failed on the unfixed code
    assert r["regressions"] == []
    assert r["baseline"] == {"passed": 6, "failed": 0, "total": 6}
    assert r["after"] == {"passed": 7, "failed": 0, "total": 7}
    assert len(r["new_tests"]) == 1
    assert sorted(r["files_changed"]) == ["auth/login.py", "tests/test_login_email_case.py"]
    assert "email.strip().lower()" in r["diff"]
    assert "auth.login.login (repo)" in r["import_check"]
    # existing tests untouched, original repo untouched, change committed on the branch
    for name in ("test_login.py", "test_users.py"):
        assert (repo / "tests" / name).read_bytes() == (SAMPLE / "tests" / name).read_bytes()
    assert "email.strip().lower()" not in (SAMPLE / "auth" / "login.py").read_text()
    assert not (SAMPLE / "tests" / "test_login_email_case.py").exists()
    assert git_status(repo) == ""
    assert (tmp_path / "judge" / "report.md").read_text(encoding="utf-8").startswith("# Agent run judge: SUCCESS")


def test_local_git_repo_gets_agent_changes_branch(tmp_path):
    """The user's own repo gets a PR-ready branch; their checked-out files stay untouched."""
    mine = tmp_path / "mine"
    shutil.copytree(SAMPLE, mine, ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache"))
    git = lambda *a: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *a], cwd=mine,
                                    capture_output=True, text=True, timeout=60).stdout
    git("init", "-q"), git("add", "-A"), git("commit", "-q", "-m", "init")
    head = git("rev-parse", "HEAD")

    state = pipeline.run(mine, TASK, runs_dir=tmp_path / "runs", run_id="pub")
    assert state["status"] == "success", state["result"]["error"]
    assert "agent-changes" in state["result"]["note"]
    assert git("diff", "--name-only", "HEAD...agent-changes").split() == [
        "auth/login.py", "tests/test_login_email_case.py"]
    assert git("rev-parse", "HEAD") == head and git("status", "--porcelain") == ""
    assert "email.strip().lower()" not in (mine / "auth" / "login.py").read_text()
    assert git("worktree", "list").count("\n") == 1  # temporary worktree removed


def make_origin(tmp_path):
    """A bare repo seeded with sample_repo, usable as a git URL (file://)."""
    seed, bare = tmp_path / "seed", tmp_path / "origin.git"
    shutil.copytree(SAMPLE, seed, ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache"))
    git = lambda cwd, *a: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *a], cwd=cwd,
                                         capture_output=True, text=True, timeout=60).stdout
    git(seed, "init", "-q", "-b", "main"), git(seed, "add", "-A"), git(seed, "commit", "-q", "-m", "init")
    git(tmp_path, "clone", "-q", "--bare", str(seed), str(bare))
    return bare, bare.as_uri(), lambda *a: git(bare, *a)


def test_url_repo_pushes_agent_changes_and_stacks(tmp_path, monkeypatch):
    bare, url, git = make_origin(tmp_path)
    first = pipeline.run(url, TASK, runs_dir=tmp_path / "runs", run_id="u1")
    assert first["status"] == "success", first["result"]["error"]
    assert "Pushed branch `agent-changes`" in first["result"]["note"]
    assert git("diff", "--name-only", "main...agent-changes").split() == [
        "auth/login.py", "tests/test_login_email_case.py"]

    other = json.loads(json.dumps(FAKE))  # second run: same fix, differently named test file
    other["edit"]["new_test"]["path"] = "tests/test_login_email_case_2.py"
    script = tmp_path / "second.json"
    script.write_text(json.dumps(other), encoding="utf-8")
    monkeypatch.setenv("FAKE_LLM_FILE", str(script))
    second = pipeline.run(url, TASK, runs_dir=tmp_path / "runs", run_id="u2")
    assert second["status"] == "success", second["result"]["error"]
    assert git("rev-list", "--count", "main..agent-changes").strip() == "2"  # stacked, not diverged
    assert git("rev-parse", "main").strip() == git("rev-parse", "main").strip() and "agent-changes" not in git("branch", "--list", "main")


def test_no_write_access_exports_local_folder(tmp_path, monkeypatch):
    """No write access + user picks local: nothing is pushed, a runnable folder with branch agent-changes appears."""
    bare, url, git = make_origin(tmp_path)
    monkeypatch.setattr(pipeline.repo_mod, "access", lambda src: "none")
    asked = []
    state = pipeline.run(url, TASK, runs_dir=tmp_path / "runs", run_id="loc", ask=lambda o: asked.append(o) or "local")
    r = state["result"]
    assert state["status"] == "success", r["error"]
    assert [o["id"] for o in asked[0]] == ["fork", "local"] and state["approval"] is None
    assert "agent-changes" not in git("branch", "--list").replace("main", "")  # origin untouched
    out = Path(r["output_path"])
    assert out.name == "origin" and (out / "CHANGES.md").is_file() and (out / ".agent-output").is_file()
    cwd_git = lambda *a: subprocess.run(["git", *a], cwd=out, capture_output=True, text=True, timeout=60).stdout
    assert cwd_git("branch", "--show-current").strip() == "agent-changes"
    assert "email.strip().lower()" in (out / "auth" / "login.py").read_text()
    assert cwd_git("status", "--porcelain") == ""  # marker and CHANGES.md are excluded, tree is clean


def test_output_folder_never_overwrites_foreign_folder(tmp_path, monkeypatch):
    base = tmp_path / "agent_output"
    (base / "origin").mkdir(parents=True)
    (base / "origin" / "mine.txt").write_text("precious")  # no marker: not ours
    bare, url, git = make_origin(tmp_path)
    state = pipeline.run(url, TASK, runs_dir=tmp_path / "runs", run_id="own")
    assert Path(state["result"]["output_path"]).name == "origin-2"
    assert (base / "origin" / "mine.txt").read_text() == "precious"
    again = pipeline.run(url, TASK, runs_dir=tmp_path / "runs", run_id="own2")  # replaces our own export
    assert Path(again["result"]["output_path"]).name == "origin-2"


def test_approval_flow_through_server(tmp_path, monkeypatch):
    import time

    import server
    from fastapi import HTTPException
    bare, url, git = make_origin(tmp_path)
    monkeypatch.setattr(pipeline.repo_mod, "access", lambda src: "none")
    monkeypatch.setattr(pipeline, "RUNS_DIR", tmp_path / "runs")
    run_id = server.start_run({"repo": url, "task": TASK})["id"]
    deadline = time.time() + 120
    while server.get_run(run_id)["status"] != "awaiting_approval":
        assert time.time() < deadline, server.get_run(run_id)
        time.sleep(0.2)
    assert [o["id"] for o in server.get_run(run_id)["approval"]["options"]] == ["fork", "local"]
    with pytest.raises(HTTPException) as bad:
        server.approve(run_id, {"choice": "nonsense"})
    assert bad.value.status_code == 400
    server.approve(run_id, {"choice": "local"})
    while server.get_run(run_id)["status"] in ("awaiting_approval", "running"):
        assert time.time() < deadline, server.get_run(run_id)
        time.sleep(0.2)
    assert server.get_run(run_id)["status"] == "success"
    with pytest.raises(HTTPException) as late:
        server.approve(run_id, {"choice": "local"})
    assert late.value.status_code == 400


def test_rejected_push_keeps_run_successful(tmp_path):
    bare, url, git = make_origin(tmp_path)
    hook = bare / "hooks" / "pre-receive"
    hook.write_bytes(b"#!/bin/sh\necho no-write-access >&2\nexit 1\n")
    state = pipeline.run(url, TASK, runs_dir=tmp_path / "runs", run_id="rej")
    assert state["status"] == "success"
    note = state["result"]["note"]
    assert "failed" in note and "no-write-access" in note and "push origin agent-changes" in note

def scripted(tmp_path, monkeypatch, change):
    script = json.loads(json.dumps(FAKE))
    change(script["edit"])
    path = tmp_path / "script.json"
    path.write_text(json.dumps(script), encoding="utf-8")
    monkeypatch.setenv("FAKE_LLM_FILE", str(path))


def test_debug_rejects_a_test_that_does_not_reproduce_the_bug(tmp_path, monkeypatch):
    scripted(tmp_path, monkeypatch, lambda e: e["new_test"].update(content="def test_nothing():\n    assert True\n"))
    state = pipeline.run(SAMPLE, TASK, runs_dir=tmp_path, run_id="norepro")
    r, repo = state["result"], tmp_path / "norepro" / "repo"
    assert state["status"] == "failed" and r["reproduced"] is False
    assert "does not reproduce the bug" in r["error"]
    assert [s["name"] for s in state["steps"]][-2:] == ["edit #2", "reproduce #2"]
    assert git_status(repo) == ""  # reverted, nothing left stashed in the way
    assert (repo / "auth" / "login.py").read_bytes() == (SAMPLE / "auth" / "login.py").read_bytes()


def test_feature_mode_adds_a_new_module(tmp_path, monkeypatch):
    def change(e):
        e["edits"] = []
        e["new_files"] = [{"path": "auth/domains.py", "content":
                           "def email_domain(email):\n    return email.strip().lower().split(\"@\")[1]\n"}]
        e["new_test"] = {"path": "tests/test_domains.py", "content":
                         "from auth.domains import email_domain\n\n\ndef test_email_domain():\n"
                         "    assert email_domain(\" Alice@Example.COM \") == \"example.com\"\n"}
    scripted(tmp_path, monkeypatch, change)
    state = pipeline.run(SAMPLE, "add email_domain(email)", runs_dir=tmp_path, run_id="feat", task_type="feature")
    r = state["result"]
    assert state["status"] == "success", r["error"]
    names = [s["name"] for s in state["steps"]]
    assert names[-3:] == ["implement #1", "verify #1", "report"] and not any("reproduce" in n for n in names)
    assert sorted(r["files_changed"]) == ["auth/domains.py", "tests/test_domains.py"]
    assert r["regressions"] == [] and r["after"] == {"passed": 7, "failed": 0, "total": 7}
    assert r["task_type"] == "feature" and "auth.domains.email_domain (repo)" in r["import_check"]


def test_breaking_edit_fails_and_reverts(tmp_path, monkeypatch):
    """An edit that breaks existing tests is never kept."""
    bad = json.loads(json.dumps(FAKE))
    bad["edit"]["edits"][0]["replace"] = "    user = None"
    script = tmp_path / "bad.json"
    script.write_text(json.dumps(bad), encoding="utf-8")
    monkeypatch.setenv("FAKE_LLM_FILE", str(script))

    state = pipeline.run(SAMPLE, TASK, runs_dir=tmp_path, run_id="bad")
    r, repo = state["result"], tmp_path / "bad" / "repo"

    assert state["status"] == "failed"
    assert r["attempts"] == 2
    assert r["regressions"] and "broke tests" in r["error"]
    assert r["diff"] == "" and r["files_changed"] == []
    assert git_status(repo) == ""
    assert (repo / "auth" / "login.py").read_bytes() == (SAMPLE / "auth" / "login.py").read_bytes()
    assert not (repo / "tests" / "test_login_email_case.py").exists()


def test_broken_requirements_is_env_failed(tmp_path):
    src = tmp_path / "src"
    src.mkdir()
    (src / "requirements.txt").write_text("this-package-does-not-exist-psi09==9.9.9\n")
    (src / "mod.py").write_text("x = 1\n")
    state = pipeline.run(src, "anything", runs_dir=tmp_path, run_id="env")
    assert state["status"] == "env_failed"
    assert "dependency install failed" in state["result"]["error"]
    assert state["steps"][-1] == {"name": "environment", "status": "error", "detail": state["steps"][-1]["detail"]}
