"""End-to-end pipeline tests, offline, with the scripted fake LLM. The venv build is the conftest stand-in."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from agent import pipeline, projects

ROOT = Path(__file__).parent.parent
SAMPLE = ROOT / "sample_repo"
FAKE = json.loads((ROOT / "tests" / "fake_llm_tinyauth.json").read_text(encoding="utf-8"))
TASK = "login fails when the email has capital letters"


@pytest.fixture(autouse=True)
def fake_llm(monkeypatch, tmp_path):
    monkeypatch.setenv("MAX_ATTEMPTS", "2")
    monkeypatch.setenv("AGENT_OUTPUT_DIR", str(tmp_path / "agent_output"))  # the old export folder: must stay unused


def sh(cwd, *args):
    return subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *args], cwd=cwd,
                          capture_output=True, text=True, timeout=60).stdout


def git_status(repo):
    return sh(repo, "status", "--porcelain")


def tree(folder):
    """{relative path: bytes} of everything in a folder, to prove it was not modified."""
    return {p.relative_to(folder).as_posix(): p.read_bytes() for p in sorted(Path(folder).rglob("*"))
            if p.is_file() and "__pycache__" not in p.parts and ".pytest_cache" not in p.parts}


def workspace(state):
    return projects.workspace(state["project_id"])


def test_login_case(tmp_path):
    """The judge case: fix the bug, add a test, break nothing; the change is one commit on the project branch."""
    state = pipeline.run(SAMPLE, TASK, run_id="judge")
    r, repo = state["result"], workspace(state)

    assert state["status"] == "success", r["error"]
    assert [s["name"] for s in state["steps"]] == ["access", "prepare", "environment", "baseline", "map", "localize",
                                                   "edit #1", "reproduce #1", "verify #1", "commit to project"]
    assert all(isinstance(s["duration_s"], float) for s in state["steps"])
    assert r["task_type"] == "debug" and r["reproduced"] is True  # the new test failed on the unfixed code
    assert r["regressions"] == []
    assert r["syntax"] is None and "syntax" not in [s["name"] for s in state["steps"]]  # everything parses: no syntax stage
    assert r["baseline"] == {"passed": 6, "failed": 0, "total": 6}
    assert r["after"] == {"passed": 7, "failed": 0, "total": 7}
    assert len(r["new_tests"]) == 1
    assert sorted(r["files_changed"]) == ["auth/login.py", "tests/test_login_email_case.py"]
    assert "email.strip().lower()" in r["diff"]
    assert "auth.login.login (repo)" in r["import_check"]
    # existing tests untouched, original repo untouched, change committed on the project branch
    for name in ("test_login.py", "test_users.py"):
        assert (repo / "tests" / name).read_bytes() == (SAMPLE / "tests" / name).read_bytes()
    assert "email.strip().lower()" not in (SAMPLE / "auth" / "login.py").read_text()
    assert not (SAMPLE / "tests" / "test_login_email_case.py").exists()
    assert git_status(repo) == ""
    # the working copy lives in the project, not in runs/<id>/repo, and holds exactly one new commit
    assert repo == tmp_path / "codefix_home" / "projects" / state["project_id"] / "workspace"
    assert r["branch"] == sh(repo, "branch", "--show-current").strip() == "codefix/sample_repo"
    assert sh(repo, "rev-parse", "HEAD").strip() == r["commit_sha"]
    assert sh(repo, "rev-parse", "HEAD~1").strip() == r["head_before"]
    assert sh(repo, "log", "-1", "--format=%s").strip() == f"codefix: debug: {TASK} [run judge]"
    assert (r["env_status"], r["env_reason"]) == ("rebuilt", "first run")
    assert state["steps"][1]["detail"].startswith("workspace clean")
    assert state["steps"][2]["detail"] == "env rebuilt (first run)"
    report = (projects.project_dir(state["project_id"]) / "runs" / "judge" / "report.md").read_text(encoding="utf-8")
    assert report.startswith("# Agent run judge: SUCCESS")
    assert r["commit_sha"] in report and r["head_before"] in report and "## Step timings" in report
    assert "| commit to project | ok |" in report and "Environment: rebuilt (first run)" in report
    assert not (ROOT / "runs" / "judge").exists()


def test_a_run_never_touches_the_users_own_git_repo(tmp_path):
    """A local git repo is snapshotted: no branch, no commit, no worktree and no file change appears in it."""
    mine = tmp_path / "mine"
    shutil.copytree(SAMPLE, mine, ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache"))
    git = lambda *a: sh(mine, *a)
    git("init", "-q"), git("add", "-A"), git("commit", "-q", "-m", "init")
    head, refs, before = git("rev-parse", "HEAD"), git("for-each-ref"), tree(mine)

    state = pipeline.run(mine, TASK, run_id="pub")
    assert state["status"] == "success", state["result"]["error"]
    assert git("rev-parse", "HEAD") == head and git("status", "--porcelain") == ""
    assert git("for-each-ref") == refs  # no agent-changes, no codefix/ branch in the user's repo
    assert git("worktree", "list").count("\n") == 1
    assert tree(mine) == before
    assert "email.strip().lower()" in (workspace(state) / "auth" / "login.py").read_text()  # it is in the project instead


def make_origin(tmp_path):
    """A bare repo seeded with sample_repo, usable as a git URL (file://)."""
    seed, bare = tmp_path / "seed", tmp_path / "origin.git"
    shutil.copytree(SAMPLE, seed, ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache"))
    sh(seed, "init", "-q", "-b", "main"), sh(seed, "add", "-A"), sh(seed, "commit", "-q", "-m", "init")
    sh(tmp_path, "clone", "-q", "--bare", str(seed), str(bare))
    return bare, bare.as_uri(), lambda *a: sh(bare, *a)


def second_script(tmp_path, monkeypatch):
    other = json.loads(json.dumps(FAKE))  # a later run: a feature on top of run 1's fix
    other["edit"].update(edits=[], new_files=[{"path": "auth/domains.py", "content":
                                               "def email_domain(email):\n    return email.strip().lower().split(\"@\")[1]\n"}],
                         new_test={"path": "tests/test_domains.py", "content":
                                   "from auth.domains import email_domain\n\n\ndef test_email_domain():\n"
                                   "    assert email_domain(\" Alice@Example.COM \") == \"example.com\"\n"})
    script = tmp_path / "second.json"
    script.write_text(json.dumps(other), encoding="utf-8")
    monkeypatch.setenv("FAKE_LLM_FILE", str(script))


def test_url_repo_runs_stack_in_the_project_and_push_nothing(tmp_path, monkeypatch):
    """Runs commit to the project only; origin changes when (and only when) the user publishes."""
    bare, url, git = make_origin(tmp_path)
    refs = git("for-each-ref")
    first = pipeline.run(url, TASK, run_id="u1")
    assert first["status"] == "success", first["result"]["error"]

    second_script(tmp_path, monkeypatch)
    second = pipeline.run(url, "add email_domain(email)", run_id="u2", task_type="feature")
    assert second["status"] == "success", second["result"]["error"]
    assert second["project_id"] == first["project_id"]  # same repo, same project
    assert second["result"]["head_before"] == first["result"]["commit_sha"]  # continued, not restarted
    assert second["result"]["baseline"]["total"] == 7  # run 1's test is part of run 2's baseline
    repo = workspace(second)
    assert sh(repo, "rev-list", "--count", "origin/main..HEAD").strip() == "2"  # stacked, not diverged
    assert git("for-each-ref") == refs  # origin untouched: no push without the explicit action

    with projects.hold(first["project_id"]), pytest.raises(projects.UserError) as e:
        projects.pull_request(first["project_id"])  # a file:// origin: pushed, but no pull request off GitHub
    assert "Pushed branch `codefix/origin`" in str(e.value)
    assert git("rev-parse", "codefix/origin").strip() == second["result"]["commit_sha"]
    assert git("rev-parse", "main").strip() in refs  # the default branch is never written to


def test_no_write_access_run_leaves_origin_untouched(tmp_path, monkeypatch):
    """No write access is not a question any more: the run works in the project and pushes nothing."""
    bare, url, git = make_origin(tmp_path)
    refs = git("for-each-ref")
    monkeypatch.setattr(pipeline.repo_mod, "access", lambda src: "none")
    state = pipeline.run(url, TASK, run_id="loc")
    r = state["result"]
    assert state["status"] == "success", r["error"]
    assert "approval" not in state and "fork" in state["steps"][0]["detail"]
    assert projects.get(state["project_id"])["kind"] == "others"
    assert git("for-each-ref") == refs  # origin untouched
    assert (r["output_path"], r["pr_url"], r["pr"]) == ("", "", None)
    assert not (tmp_path / "agent_output").exists()  # the automatic export folder is gone


def test_a_run_writes_only_inside_codefix_home(tmp_path):
    """Folders the agent did not create are never written to: not the source, not a neighbour, not the old export folder."""
    src, foreign = tmp_path / "work" / "origin", tmp_path / "agent_output" / "origin"
    shutil.copytree(SAMPLE, src, ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache"))
    foreign.mkdir(parents=True)
    (foreign / "mine.txt").write_text("precious")
    before = tree(tmp_path / "work"), tree(tmp_path / "agent_output")
    for run_id in ("own", "own2"):
        assert pipeline.run(src, TASK, run_id=run_id)["status"] in ("success", "failed")
    assert (tree(tmp_path / "work"), tree(tmp_path / "agent_output")) == before
    assert {p.name for p in tmp_path.iterdir()} == {"work", "agent_output", "codefix_home"}


def test_no_write_access_run_through_server_needs_no_approval(tmp_path, monkeypatch):
    import time

    import server
    bare, url, git = make_origin(tmp_path)
    token = "gho_" + "x" * 36
    monkeypatch.setattr(pipeline.repo_mod, "access", lambda src: "none")
    monkeypatch.setattr(pipeline.repo_mod, "_token", token)  # URL repos need a sign-in
    monkeypatch.setitem(server.LOGINS, token, "me")
    started = server.start_run({"repo": url, "task": TASK})
    run_id, seen, deadline = started["id"], set(), time.time() + 120
    while server.get_run(run_id)["status"] == "running":
        seen.add(server.get_run(run_id)["status"])
        assert time.time() < deadline, server.get_run(run_id)
        time.sleep(0.1)
    state = server.get_run(run_id)
    assert state["status"] == "success", state["result"]
    assert seen <= {"running"} and "approval" not in state  # it never stopped to ask
    assert not hasattr(server, "approve") and not hasattr(pipeline, "OPTIONS")
    assert state["project_id"] == started["project_id"]
    project = server.get_project(started["project_id"])
    assert (project["kind"], project["display_name"], project["busy"]) == ("others", "origin", False)


def test_rejected_push_is_reported_and_changes_nothing(tmp_path):
    bare, url, git = make_origin(tmp_path)
    hook = bare / "hooks" / "pre-receive"
    hook.write_bytes(b"#!/bin/sh\necho no-write-access >&2\nexit 1\n")
    state = pipeline.run(url, TASK, run_id="rej")
    assert state["status"] == "success"  # the run itself does not depend on being able to push
    pid, refs = state["project_id"], git("for-each-ref")
    with projects.hold(pid), pytest.raises(RuntimeError) as e:
        projects.pull_request(pid)
    assert "push failed" in str(e.value) and "no-write-access" in str(e.value)
    project = projects.get(pid)
    assert project["pushed_sha"] is None and project["pr_url"] is None and project["head_sha"] == state["result"]["commit_sha"]
    assert git("for-each-ref") == refs and git_status(workspace(state)) == ""


def scripted(tmp_path, monkeypatch, change):
    script = json.loads(json.dumps(FAKE))
    change(script["edit"])
    path = tmp_path / "script.json"
    path.write_text(json.dumps(script), encoding="utf-8")
    monkeypatch.setenv("FAKE_LLM_FILE", str(path))


def test_debug_rejects_a_test_that_does_not_reproduce_the_bug(tmp_path, monkeypatch):
    scripted(tmp_path, monkeypatch, lambda e: e["new_test"].update(content="def test_nothing():\n    assert True\n"))
    state = pipeline.run(SAMPLE, TASK, run_id="norepro")
    r, repo = state["result"], workspace(state)
    assert state["status"] == "failed" and r["reproduced"] is False
    assert "does not reproduce the bug" in r["error"]
    assert [s["name"] for s in state["steps"]][-2:] == ["edit #2", "reproduce #2"]
    assert git_status(repo) == ""  # reverted, nothing left stashed in the way
    assert sh(repo, "stash", "list") == ""
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
    state = pipeline.run(SAMPLE, "add email_domain(email)", run_id="feat", task_type="feature")
    r = state["result"]
    assert state["status"] == "success", r["error"]
    names = [s["name"] for s in state["steps"]]
    assert names[-3:] == ["implement #1", "verify #1", "commit to project"] and not any("reproduce" in n for n in names)
    assert sorted(r["files_changed"]) == ["auth/domains.py", "tests/test_domains.py"]
    assert r["regressions"] == [] and r["after"] == {"passed": 7, "failed": 0, "total": 7}
    assert r["task_type"] == "feature" and "auth.domains.email_domain (repo)" in r["import_check"]
    assert sh(workspace(state), "log", "-1", "--format=%s").strip() == "codefix: feature: add email_domain(email) [run feat]"


def test_breaking_edit_fails_and_reverts(tmp_path, monkeypatch):
    """An edit that breaks existing tests is never kept: the project head and the files are as before."""
    bad = json.loads(json.dumps(FAKE))
    bad["edit"]["edits"][0]["replace"] = "    user = None"
    script = tmp_path / "bad.json"
    script.write_text(json.dumps(bad), encoding="utf-8")
    monkeypatch.setenv("FAKE_LLM_FILE", str(script))

    state = pipeline.run(SAMPLE, TASK, run_id="bad")
    r, repo = state["result"], workspace(state)

    assert state["status"] == "failed"
    assert r["attempts"] == 2
    assert r["regressions"] and "broke tests" in r["error"]
    assert r["diff"] == "" and r["files_changed"] == [] and r["commit_sha"] is None
    assert git_status(repo) == ""
    assert sh(repo, "rev-parse", "HEAD").strip() == r["head_before"] == projects.get(state["project_id"])["base_sha"]
    assert (repo / "auth" / "login.py").read_bytes() == (SAMPLE / "auth" / "login.py").read_bytes()
    assert not (repo / "tests" / "test_login_email_case.py").exists()


@pytest.mark.real_env
def test_broken_requirements_is_env_failed(tmp_path):
    src = tmp_path / "src"
    src.mkdir()
    (src / "requirements.txt").write_text("this-package-does-not-exist-psi09==9.9.9\n")
    (src / "mod.py").write_text("x = 1\n")
    state = pipeline.run(src, "anything", run_id="env")
    assert state["status"] == "env_failed"
    assert "dependency install failed" in state["result"]["error"]
    last = state["steps"][-1]
    assert (last["name"], last["status"]) == ("environment", "error") and last["duration_s"] > 0
    # the half-built venv is not usable: no .ready marker, so the next run rebuilds it instead of using it
    pid = state["project_id"]
    assert not (projects.project_dir(pid) / "venv" / ".ready").exists()
    assert projects.summary(projects.get(pid))["env"] == {"ready": False, "state": "missing", "python": None, "last_used": None}
    assert git_status(workspace(state)) == "" and state["result"]["commit_sha"] is None
