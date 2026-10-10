"""Persistent projects: continuation, per-project environment, history, reset, sync, export, scoping, locking.

Offline, with the scripted fake LLM. Only the tests marked real_env build real venvs.
"""
import importlib
import json
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest
from fastapi import HTTPException

import cli
import server
from agent import edits, envmgr, pipeline, projects, runner
from agent import repo as repo_mod

ROOT = Path(__file__).parent.parent
SAMPLE = ROOT / "sample_repo"
FAKE = json.loads((ROOT / "tests" / "fake_llm_tinyauth.json").read_text(encoding="utf-8"))
TASK = "login fails when the email has capital letters"
KEY = "test-secret-value"
TOKEN = "gho_" + "z" * 36

# The scripted answers of three runs that build on each other.
FIX = FAKE["edit"]  # debug: fixes auth/login.py, adds tests/test_login_email_case.py
DOMAINS = {"explanation": "Adds email_domain.", "edits": [],
           "new_files": [{"path": "auth/domains.py", "content":
                          "def email_domain(email):\n    return email.strip().lower().split(\"@\")[1]\n"}],
           "new_test": {"path": "tests/test_domains.py", "content":
                        "from auth.domains import email_domain\n\n\ndef test_email_domain():\n"
                        "    assert email_domain(\" Alice@Example.COM \") == \"example.com\"\n"}}
CONTACT = {"explanation": "Adds same_domain, built on email_domain from the earlier run.", "edits": [],
           "new_files": [{"path": "auth/contact.py", "content":
                          "from auth.domains import email_domain\n\n\ndef same_domain(a, b):\n"
                          "    return email_domain(a) == email_domain(b)\n"}],
           "new_test": {"path": "tests/test_contact.py", "content":
                        "from auth.contact import same_domain\n\n\ndef test_same_domain():\n"
                        "    assert same_domain(\"a@X.com\", \"b@x.COM\")\n"}}


@pytest.fixture(autouse=True)
def settings(monkeypatch):
    monkeypatch.setenv("MAX_ATTEMPTS", "1")
    yield
    repo_mod.set_token("")


@pytest.fixture
def run(tmp_path, monkeypatch):
    """run(src, edit, run_id, task_type="feature") -> state, with `edit` as the fake LLM's answer."""
    def go(src, edit, run_id, task_type="feature", task=None, **kw):
        script = tmp_path / f"{run_id}.json"
        script.write_text(json.dumps({"localize": FAKE["localize"], "edit": edit}), encoding="utf-8")
        monkeypatch.setenv("FAKE_LLM_FILE", str(script))
        return pipeline.run(src, task or edit["explanation"], run_id=run_id, task_type=task_type, **kw)
    return go


def sh(cwd, *args):
    return subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *args], cwd=cwd,
                          capture_output=True, text=True, timeout=60).stdout.strip()


def tree(folder):
    return {p.relative_to(folder).as_posix(): p.read_bytes() for p in sorted(Path(folder).rglob("*"))
            if p.is_file() and not {"__pycache__", ".pytest_cache", ".git"} & set(p.parts)}


def copy_sample(dest):
    shutil.copytree(SAMPLE, dest, ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache"))
    return dest


def make_origin(tmp_path):
    """A bare repo seeded with sample_repo (a file:// URL), plus a clone to push "upstream" commits from."""
    seed, bare = copy_sample(tmp_path / "seed"), tmp_path / "origin.git"
    sh(seed, "init", "-q", "-b", "main"), sh(seed, "add", "-A"), sh(seed, "commit", "-q", "-m", "init")
    sh(tmp_path, "clone", "-q", "--bare", str(seed), str(bare))
    sh(seed, "remote", "add", "origin", str(bare))
    return bare, bare.as_uri(), seed


def upstream_commit(seed, rel, text):
    (seed / rel).write_text(text, encoding="utf-8", newline="\n")
    sh(seed, "add", "-A"), sh(seed, "commit", "-q", "-m", f"upstream: {rel}"), sh(seed, "push", "-q", "origin", "main")
    return sh(seed, "rev-parse", "HEAD")


def status_of(call, code):
    with pytest.raises(HTTPException) as e:
        call()
    assert e.value.status_code == code
    return e.value.detail


# ---- identity ----------------------------------------------------------------------------------
def test_project_identity(tmp_path):
    key = projects.project_key
    assert key("https://github.com/Octo/Repo.git") == key("https://github.com/octo/repo/") == "github:octo/repo"
    assert key("https://user:hunter2@example.com/a/b.git") == "git:https://example.com/a/b"
    assert key(str(tmp_path)) == key(str(tmp_path) + "/") and key(str(tmp_path)).startswith("local:")
    if sys.platform == "win32":
        assert key(str(tmp_path).upper()) == key(str(tmp_path).lower())
    pid = projects.project_id("alice", "github:octo/repo")
    assert len(pid) == 16 and pid != projects.project_id("bob", "github:octo/repo")
    mine = projects.ensure("alice", "https://github.com/Octo/Repo.git", "mine")
    assert (mine["project_id"], mine["display_name"], mine["branch"]) == (pid, "Repo", "codefix/repo")
    # `source` is what /api/repos lists, and giving it back as the repo lands on the same project
    assert mine["source"] == "https://github.com/Octo/Repo"
    assert projects.ensure("alice", mine["source"])["project_id"] == pid
    assert projects.ensure("alice", "https://github.com/Octo/Repo.git", "others")["display_name"] == "Octo/Repo"
    local = projects.ensure("alice", str(tmp_path))
    assert (local["kind"], local["display_name"], local["source"]) == ("local", tmp_path.name, str(tmp_path.resolve()))
    assert projects.ensure("alice", local["source"])["project_id"] == local["project_id"]


# ---- 5.6 #1 continuation, #2 failed run leaves everything as it was -------------------------------
def test_run_two_builds_on_run_one_and_its_test_is_locked(tmp_path, run):
    src = copy_sample(tmp_path / "src")
    one = run(src, DOMAINS, "one")
    assert one["status"] == "success", one["result"]["error"]
    two = run(src, CONTACT, "two")
    r = two["result"]
    assert two["status"] == "success", r["error"]
    assert two["project_id"] == one["project_id"]
    assert r["head_before"] == one["result"]["commit_sha"]  # continued from the project head
    assert "auth.domains.email_domain (repo)" in r["import_check"]  # run 1's function is really there
    # run 1's test is an existing test now: in run 2's baseline, and it still passes afterwards
    assert one["result"]["baseline"]["total"] == 6 and r["baseline"] == {"passed": 7, "failed": 0, "total": 7}
    assert r["after"]["total"] == 8 and r["regressions"] == []
    assert r["new_tests"] == ["tests.test_contact::test_same_domain"]  # only run 2's own test is "new"
    assert edits.is_test_file("tests/test_domains.py")
    assert two["steps"][1]["detail"] == "workspace clean"
    pid, ws = two["project_id"], projects.workspace(two["project_id"])
    summary = projects.summary(projects.get(pid))
    assert summary["locked_tests"] == {"total": 8, "added_by_runs": 2}
    assert (summary["changes_ahead_of_base"], summary["run_count"], summary["head_sha"]) == (2, 2, r["commit_sha"])
    assert not (src / "auth" / "domains.py").exists()  # none of it is in the user's folder

    # run 3 tries to change run 1's (now locked) test: refused, and the project is exactly as run 2 left it
    before = tree(ws)
    attack = {**CONTACT, "edits": [{"path": "tests/test_domains.py", "search": '== "example.com"', "replace": '== "x"'}],
              "new_files": [], "new_test": {"path": "tests/test_other.py", "content": "def test_x():\n    assert True\n"}}
    three = run(src, attack, "three")
    assert three["status"] == "failed" and "existing tests are locked" in three["result"]["error"]
    assert three["result"]["head_before"] == r["commit_sha"] and three["result"]["commit_sha"] is None
    assert sh(ws, "rev-parse", "HEAD") == r["commit_sha"] and sh(ws, "status", "--porcelain") == ""
    assert tree(ws) == before
    assert projects.summary(projects.get(pid))["changes_ahead_of_base"] == 2
    assert [x["status"] for x in projects.runs(pid)] == ["failed", "success", "success"]  # newest first


def test_everything_since_head_before_becomes_one_commit_or_none(tmp_path, run, monkeypatch):
    """The syntax stage may commit on its own in the middle of a run: success squashes it, failure removes it."""
    src = copy_sample(tmp_path / "src")
    real_map = repo_mod.repo_map

    def map_then_stage_commit(repo):  # stands in for the syntax pre-stage, which runs right after the map step
        (Path(repo) / "auth" / "repaired.py").write_text("FIXED = True\n", encoding="utf-8")
        repo_mod.commit(repo, "codefix: syntax repair")
        return real_map(repo)

    monkeypatch.setattr(repo_mod, "repo_map", map_then_stage_commit)
    bad = run(src, {**FIX, "edits": [{**FIX["edits"][0], "replace": "    user = None"}]}, "bad", "debug", TASK)
    ws = projects.workspace(bad["project_id"])
    base = projects.get(bad["project_id"])["base_sha"]
    assert bad["status"] == "failed" and bad["result"]["head_before"] == base
    assert sh(ws, "rev-parse", "HEAD") == base and sh(ws, "status", "--porcelain") == ""
    assert not (ws / "auth" / "repaired.py").exists()  # the stage's own commit went with the failed run

    good = run(src, FIX, "good", "debug", TASK)
    r = good["result"]
    assert good["status"] == "success", r["error"]
    assert sh(ws, "rev-list", "--count", f"{base}..HEAD") == "1"  # ONE commit, not two
    assert sh(ws, "log", "-1", "--format=%s") == f"codefix: debug: {TASK} [run good]"
    assert sorted(r["files_changed"]) == ["auth/login.py", "auth/repaired.py", "tests/test_login_email_case.py"]
    assert "FIXED = True" in r["diff"] and r["commit_sha"] == sh(ws, "rev-parse", "HEAD")


def test_a_dirty_workspace_is_cleaned_before_a_run_and_logged(tmp_path, run):
    src = copy_sample(tmp_path / "src")
    one = run(src, DOMAINS, "one")
    ws = projects.workspace(one["project_id"])
    (ws / "leftover.py").write_text("x = 1\n")  # what a crashed run leaves behind
    (ws / "auth" / "login.py").write_text("broken\n")
    two = run(src, CONTACT, "two")
    assert two["status"] == "success", two["result"]["error"]
    detail = two["steps"][1]["detail"]
    assert detail.startswith("cleaned 2 leftover change(s)") and "leftover.py" in detail
    assert not (ws / "leftover.py").exists() and "leftover" not in two["result"]["diff"]
    assert projects.run_state(two["project_id"], "two")["steps"][1]["detail"] == detail  # in the run record


# ---- 5.6 #3 env reused / rebuilt (deps changed) ---------------------------------------------------
def test_env_is_reused_until_a_run_changes_the_dependencies(tmp_path, run, codefix_home):
    src = copy_sample(tmp_path / "src")
    one = run(src, DOMAINS, "one")
    assert (one["result"]["env_status"], one["result"]["env_reason"]) == ("rebuilt", "first run")
    deps = {**CONTACT, "new_files": CONTACT["new_files"] + [{"path": "requirements.txt", "content": "# nothing yet\n"}]}
    two = run(src, deps, "two")
    assert two["status"] == "success", two["result"]["error"]
    assert (two["result"]["env_status"], two["result"]["env_reason"]) == ("reused", None)
    assert two["steps"][2]["detail"] == "env reused" and len(codefix_home) == 1
    three = run(src, FIX, "three", "debug", TASK)
    assert three["status"] == "success", three["result"]["error"]
    assert three["steps"][2]["detail"] == "env rebuilt (deps changed)"
    assert (three["result"]["env_status"], three["result"]["env_reason"]) == ("rebuilt", "deps changed")
    assert len(codefix_home) == 2 and codefix_home[0] == codefix_home[1] == envmgr.venv_dir(one["project_id"])
    listed = {x["run_id"]: (x["env_status"], x["env_reason"]) for x in projects.runs(one["project_id"])}
    assert listed == {"one": ("rebuilt", "first run"), "two": ("reused", None), "three": ("rebuilt", "deps changed")}
    report = (projects.project_dir(one["project_id"]) / "runs" / "three" / "report.md").read_text(encoding="utf-8")
    assert "Environment: rebuilt (deps changed)" in report


def test_dep_hash_covers_every_dependency_file(tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    a.mkdir(), b.mkdir()
    assert envmgr.dep_hash(a) == envmgr.dep_hash(b)
    seen = {envmgr.dep_hash(a)}
    for name in ("requirements.txt", "requirements-dev.txt", "pyproject.toml", "setup.cfg", "setup.py"):
        (a / name).write_text("x\n")
        seen.add(envmgr.dep_hash(a))
    assert len(seen) == 6
    (a / "notes.txt").write_text("x\n")
    assert envmgr.dep_hash(a) in seen  # not a dependency file


# ---- 5.6 #4 separate venvs, #5 no .ready -> rebuilt ----------------------------------------------
def opened(tmp_path, name):
    """A project with a workspace, without running the pipeline."""
    pid = projects.ensure("local-anon", str(copy_sample(tmp_path / name)))["project_id"]
    projects.open_workspace(pid)
    return pid


@pytest.mark.real_env
def test_two_projects_with_identical_dependencies_get_their_own_real_venv(tmp_path):
    a, b = opened(tmp_path, "a"), opened(tmp_path, "b")
    wa, wb = projects.workspace(a), projects.workspace(b)
    assert envmgr.dep_hash(wa) == envmgr.dep_hash(wb)  # identical dependency files
    with projects.hold(a), projects.hold(b):
        ea, eb = envmgr.ensure(a, wa), envmgr.ensure(b, wb)
        again = envmgr.ensure(a, wa)
    assert (ea["status"], ea["reason"], eb["status"], again["status"], again["reason"]) == ("rebuilt", "first run", "rebuilt", "reused", None)
    assert envmgr.venv_dir(a) != envmgr.venv_dir(b) and ea["python"] != eb["python"] == runner.venv_python(envmgr.venv_dir(b))
    for pid, env in ((a, ea), (b, eb)):
        assert env["python"].is_relative_to(projects.project_dir(pid) / "venv")
        # built in place, so the interpreter works where it stands and has pytest
        out = subprocess.run([str(env["python"]), "-c", "import sys, pytest; print(sys.prefix)"],
                             capture_output=True, text=True, timeout=120)
        assert out.returncode == 0, out.stderr
        assert Path(out.stdout.strip()).resolve() == envmgr.venv_dir(pid).resolve()
        assert (envmgr.venv_dir(pid) / ".ready").is_file()
    assert ea["extra_env"]["PYTHONPATH"] == str(wa)  # sample_repo is not installable: found through PYTHONPATH
    assert projects.summary(projects.get(a))["env"]["python"] == f"{sys.version_info.major}.{sys.version_info.minor}"


def test_a_venv_without_the_ready_marker_is_rebuilt_never_used(tmp_path, codefix_home, monkeypatch):
    pid = opened(tmp_path, "a")
    ws, venv = projects.workspace(pid), envmgr.venv_dir(pid)
    assert envmgr.ensure(pid, ws)["reason"] == "first run"
    assert projects.summary(projects.get(pid))["env"]["state"] == "ready"
    for spoil in (lambda: (venv / ".ready").unlink(), lambda: (venv / ".ready").write_text("{half a marker")):
        spoil()
        (venv / "half-built.txt").write_text("from a build that was killed")
        assert projects.summary(projects.get(pid))["env"]["ready"] is (venv / ".ready").exists()
        env = envmgr.ensure(pid, ws)
        assert (env["status"], env["reason"]) == ("rebuilt", "not ready")
        assert not (venv / "half-built.txt").exists()  # the old folder was deleted, not built over
    assert len(codefix_home) == 3

    def killed(repo, venv):
        Path(venv).mkdir(parents=True)
        raise runner.EnvError("dependency install failed")

    (ws / "requirements.txt").write_text("something\n")
    monkeypatch.setattr(runner, "setup_env", killed)
    with pytest.raises(runner.EnvError):
        envmgr.ensure(pid, ws)
    assert venv.exists() and not (venv / ".ready").exists()  # a failed build never looks ready
    assert projects.summary(projects.get(pid))["env"] ["ready"] is False
    monkeypatch.undo()


def test_uninstalled_projects_run_through_pythonpath(tmp_path):
    pid = opened(tmp_path, "a")
    ws = projects.workspace(pid)
    (ws / "src").mkdir()
    assert envmgr.ensure(pid, ws)["extra_env"] == {"PYTHONPATH": f"{ws}{__import__('os').pathsep}{ws / 'src'}"}
    (ws / "pyproject.toml").write_text("[project]\nname='x'\nversion='0'\n")
    env = envmgr.ensure(pid, ws)  # the stand-in build reports a working `pip install -e .`
    assert (env["reason"], env["extra_env"]) == ("deps changed", {})


@pytest.mark.real_env  # the real setup_env, but every command it would start is only recorded
def test_uv_is_used_when_it_is_on_path_and_pip_otherwise(tmp_path, monkeypatch):
    cmds = []
    monkeypatch.setattr(runner, "_run", lambda cmd, cwd, timeout, extra_env=None: cmds.append(cmd) or (0, ""))
    (tmp_path / "requirements.txt").write_text("x\n")
    (tmp_path / "setup.py").write_text("")
    venv = tmp_path / "v"
    python = str(runner.venv_python(venv))
    monkeypatch.setattr(runner.shutil, "which", lambda name: "C:/tools/uv.exe" if name == "uv" else None)
    assert runner.setup_env(tmp_path, venv) == (runner.venv_python(venv), "")
    assert cmds == [["uv", "venv", "-q", "--python", sys.executable, str(venv)],
                    ["uv", "pip", "install", "-q", "--python", python, "pytest", "-r", "requirements.txt"],
                    ["uv", "pip", "install", "-q", "--python", python, "-e", "."]]
    cmds.clear()
    monkeypatch.setattr(runner.shutil, "which", lambda name: None)
    runner.setup_env(tmp_path, venv)
    assert cmds[0] == [sys.executable, "-m", "venv", str(venv)] and cmds[1][:4] == [python, "-m", "pip", "install"]


def test_eviction_removes_only_the_least_recently_used_idle_venv(tmp_path, monkeypatch):
    monkeypatch.setenv("MAX_CACHED_VENVS", "2")
    a, b, c = (opened(tmp_path, n) for n in "abc")
    for pid, used in ((a, "2026-01-01T00:00:00Z"), (b, "2026-01-02T00:00:00Z")):
        envmgr.ensure(pid, projects.workspace(pid))
        projects.set_fields(pid, env_last_used=used)
    with projects.hold(a), projects.hold(c):  # a is the oldest but a run is using it
        envmgr.ensure(c, projects.workspace(c))
    states = lambda: [projects.summary(projects.get(p))["env"]["state"] for p in (a, b, c)]
    assert states() == ["ready", "evicted", "ready"]  # b went: the oldest IDLE one
    assert not envmgr.venv_dir(b).exists() and projects.workspace(b).is_dir()  # only the venv, never the workspace
    env = envmgr.ensure(b, projects.workspace(b))  # its next run rebuilds it, and now a (idle, oldest) goes
    assert (env["status"], env["reason"]) == ("rebuilt", "evicted")
    assert states() == ["evicted", "ready", "ready"]


# ---- 5.6 #6 reset --------------------------------------------------------------------------------
def test_reset_tags_the_old_head_then_moves_it(tmp_path, run):
    src = copy_sample(tmp_path / "src")
    one, two = run(src, DOMAINS, "one"), run(src, CONTACT, "two")
    failed = run(src, {**CONTACT, "new_test": {"path": "tests/test_contact.py", "content": "x"}}, "bad")
    pid, ws = one["project_id"], projects.workspace(one["project_id"])
    c1, c2 = one["result"]["commit_sha"], two["result"]["commit_sha"]

    done = server.reset_project(pid, {"to": "one"})
    assert done["head_sha"] == c1 == sh(ws, "rev-parse", "HEAD") and sh(ws, "status", "--porcelain") == ""
    tag = done["archive_tag"]
    assert __import__("re").fullmatch(r"codefix/archive/\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d", tag)
    assert sh(ws, "rev-parse", tag) == c2  # the commit that was reset away is still reachable
    assert not (ws / "auth" / "contact.py").exists() and (ws / "auth" / "domains.py").exists()
    detail = server.get_project(pid)
    assert detail["archive_tags"] == [tag] and detail["head_sha"] == c1 and detail["changes_ahead_of_base"] == 1
    assert detail["events"][0]["kind"] == "reset" and tag in detail["events"][0]["detail"]  # recorded in history

    base = server.reset_project(pid, {"to": "base"})  # within the same second: a second, distinct tag
    assert base["head_sha"] == detail["base_sha"] and base["archive_tag"] != tag
    assert sh(ws, "rev-parse", base["archive_tag"]) == c1 and len(server.get_project(pid)["archive_tags"]) == 2
    assert server.get_project(pid)["locked_tests"] == {"total": 6, "added_by_runs": 0}
    for to in ("bad", "nope", None):  # a failed run or an unknown one is not a place to reset to
        assert "successful run" in status_of(lambda: server.reset_project(pid, {"to": to}), 400)
    assert sh(ws, "rev-parse", "HEAD") == detail["base_sha"]
    again = run(src, DOMAINS, "again")  # the next run continues from where the reset put the head
    assert again["status"] == "success" and again["result"]["baseline"]["total"] == 6
    assert failed["status"] == "failed"


# ---- 5.6 #7 sync ---------------------------------------------------------------------------------
def test_sync_rebases_and_a_conflict_changes_nothing(tmp_path, run):
    bare, url, seed = make_origin(tmp_path)
    one = run(url, FIX, "one", "debug", TASK)
    assert one["status"] == "success", one["result"]["error"]
    pid, ws = one["project_id"], projects.workspace(one["project_id"])
    with projects.hold(pid), pytest.raises(projects.UserError):
        projects.pull_request(pid)  # pushed (file:// origin: no pull request)
    assert sh(bare, "rev-parse", "codefix/origin") == one["result"]["commit_sha"]

    up1 = upstream_commit(seed, "NOTES.md", "upstream notes\n")
    assert server.sync_project(pid) == {"status": "ok"}
    detail, new = server.get_project(pid), sh(ws, "rev-parse", "HEAD")
    assert (detail["base_sha"], detail["head_sha"], detail["changes_ahead_of_base"]) == (up1, new, 1)
    assert (ws / "NOTES.md").is_file() and "email.strip().lower()" in (ws / "auth" / "login.py").read_text()
    assert new != one["result"]["commit_sha"]
    assert sh(ws, "rev-parse", detail["archive_tags"][0]) == one["result"]["commit_sha"]  # the pre-rebase commit is kept
    listed = server.list_runs(pid)[0]
    assert (listed["commit_sha"], listed["head_before"]) == (new, up1)  # the run still points at its commit
    assert server.project_diff(pid, "one") == {"diff": ""} and "email.strip().lower()" in server.project_diff(pid, "base")["diff"]
    assert detail["events"][0]["kind"] == "sync"
    # the rewritten branch replaces the pushed one: the single case where the push is forced, with a lease
    assert projects.get(pid)["force_next_push"] == 1
    with projects.hold(pid), pytest.raises(projects.UserError):
        projects.pull_request(pid)
    assert sh(bare, "rev-parse", "codefix/origin") == new and projects.get(pid)["force_next_push"] == 0
    assert sh(bare, "rev-parse", "main") == up1  # the default branch only ever changes upstream

    login = (seed / "auth" / "login.py").read_text(encoding="utf-8")
    upstream_commit(seed, "auth/login.py", login.replace("    user = get_user(email)", "    user = get_user(email.upper())"))
    before = tree(ws), sh(ws, "rev-parse", "HEAD"), sh(ws, "for-each-ref", "refs/heads", "refs/tags"), projects.get(pid)["base_sha"]
    assert server.sync_project(pid) == {"status": "conflict", "conflicts": ["auth/login.py"]}
    assert (tree(ws), sh(ws, "rev-parse", "HEAD"), sh(ws, "for-each-ref", "refs/heads", "refs/tags"), projects.get(pid)["base_sha"]) == before
    assert sh(ws, "status", "--porcelain") == "" and sh(ws, "branch", "--show-current") == "codefix/origin"
    assert not (ws / ".git" / "rebase-merge").exists() and not (ws / ".git" / "rebase-apply").exists()
    assert "<<<<<<<" not in (ws / "auth" / "login.py").read_text()  # nothing was half-merged
    assert projects.get(pid)["force_next_push"] == 0

    local = run(copy_sample(tmp_path / "local"), DOMAINS, "loc")
    assert server.sync_project(local["project_id"]) == {"status": "not_applicable"}


# ---- 5.6 #8 one run at a time per project ---------------------------------------------------------
def test_second_run_on_a_busy_project_is_409_while_another_project_proceeds(tmp_path, monkeypatch):
    a, b = copy_sample(tmp_path / "a"), copy_sample(tmp_path / "b")
    gate, running = threading.Event(), []

    def slow_run(repo, task, **kw):
        running.append(repo)
        assert gate.wait(60)

    monkeypatch.setattr(pipeline, "run", slow_run)
    first = server.start_run({"mode": "local", "repo": str(a), "task": "x"})
    pid = first["project_id"]
    assert status_of(lambda: server.start_run({"mode": "local", "repo": str(a), "task": "y"}), 409) == {
        "message": projects.BUSY, "project_id": pid}
    other = server.start_run({"mode": "local", "repo": str(b), "task": "z"})  # a different project is not held up
    assert other["project_id"] != pid
    for _ in range(500):
        if len(running) == 2:
            break
        time.sleep(0.01)
    assert sorted(running) == sorted([str(a), str(b)])  # both are really running at the same time
    assert {p["project_id"]: p["busy"] for p in server.list_projects()} == {pid: True, other["project_id"]: True}
    assert server.get_run(first["id"])["started_at"] and server.get_run(first["id"])["result"]["task_type"] == "debug"
    # every action that would move things under a run is refused while it is going
    for action in (lambda: server.reset_project(pid, {"to": "base"}), lambda: server.sync_project(pid),
                   lambda: server.export_project(pid, {}), lambda: server.delete_venv(pid), lambda: server.delete_project(pid)):
        assert status_of(action, 409) == projects.BUSY
    assert projects.get(pid)
    gate.set()
    for _ in range(500):
        if not projects.is_busy(pid):
            break
        time.sleep(0.01)
    assert server.start_run({"mode": "local", "repo": str(a), "task": "again"})["project_id"] == pid  # free again


def test_pipeline_itself_refuses_a_busy_project_and_shows_the_running_run(tmp_path, run):
    src = copy_sample(tmp_path / "src")
    pid = projects.ensure("local-anon", str(src))["project_id"]
    with projects.hold(pid), pytest.raises(projects.Busy):
        pipeline.run(src, "x")
    assert projects.runs(pid) == [] and not projects.is_busy(pid)

    seen = []

    def watch(state):  # what another browser tab sees while the run is going
        if state["steps"] and state["steps"][-1]["name"] == "baseline" and not seen:
            seen.append((server.list_projects()[0], server.list_runs(pid), dict(state["result"]), state["started_at"]))

    run(src, DOMAINS, "live", on_step=watch)
    project, listed, result, started = seen[0]
    assert project["busy"] is True
    assert project["last_run"] == {"run_id": "live", "status": "running", "mode": "feature", "finished_at": None}
    assert (listed[0]["run_id"], listed[0]["status"], listed[0]["task"], listed[0]["mode"]) == ("live", "running", "Adds email_domain.", "feature")
    assert listed[0]["started_at"] == started and listed[0]["env_status"] == "rebuilt"
    assert result["head_before"] and (result["task_type"], result["env_status"], result["env_reason"]) == ("feature", "rebuilt", "first run")
    assert server.list_projects()[0]["busy"] is False and server.list_projects()[0]["last_run"]["status"] == "success"


# ---- 5.6 #9 history survives a restart, and the API shapes ----------------------------------------
PROJECT_KEYS = {"project_id", "kind", "display_name", "source", "branch", "head_sha", "changes_ahead_of_base", "run_count",
                "last_run", "env", "locked_tests", "busy"}
RUN_KEYS = {"run_id", "mode", "task", "status", "head_before", "commit_sha", "started_at", "finished_at", "duration_s",
            "env_status", "env_reason", "attempts", "syntax_stage"}


def test_history_survives_a_restart(tmp_path, run):
    src = copy_sample(tmp_path / "src")
    one = run(src, DOMAINS, "one")
    bad = run(src, {**CONTACT, "new_test": {"path": "tests/test_contact.py", "content": "x"}}, "bad")
    pid = one["project_id"]
    cut_off = {"id": "cut", "project_id": pid, "status": "running", "started_at": projects.now(), "finished_at": None,
               "duration_s": None, "steps": [], "result": {**one["result"], "commit_sha": None}}
    projects.start_run(cut_off, "a run the old server died in the middle of")
    live = server.RUNS.setdefault("one", one)

    importlib.reload(projects)  # a new process: no locks, no connections, no in-memory runs
    importlib.reload(server)
    assert server.RUNS == {} and not projects.is_busy(pid) and live

    (listed,) = server.list_projects()
    assert set(listed) == PROJECT_KEYS
    assert (listed["project_id"], listed["kind"], listed["display_name"], listed["source"]) == (pid, "local", "src", str(src.resolve()))
    assert (listed["branch"], listed["head_sha"], listed["changes_ahead_of_base"], listed["run_count"]) == (
        "codefix/src", one["result"]["commit_sha"], 1, 3)
    assert listed["last_run"] == {"run_id": "cut", "status": "failed", "mode": "feature", "finished_at": None}
    assert set(listed["env"]) == {"ready", "state", "python", "last_used"} and listed["env"]["ready"] is True
    assert listed["locked_tests"] == {"total": 7, "added_by_runs": 1} and listed["busy"] is False
    detail = server.get_project(pid)
    assert set(detail) == PROJECT_KEYS | {"base_ref", "base_sha", "base_label", "archive_tags", "pr_url", "events"}
    assert detail["base_label"] == "snapshot of src" and detail["base_sha"] == one["result"]["head_before"]

    runs = server.list_runs(pid)
    assert [r["run_id"] for r in runs] == ["cut", "bad", "one"] and all(set(r) == RUN_KEYS for r in runs)  # newest first
    last = runs[2]
    assert (last["mode"], last["task"], last["status"], last["attempts"], last["syntax_stage"]) == ("feature", "Adds email_domain.", "success", 1, False)
    assert (last["head_before"], last["commit_sha"]) == (one["result"]["head_before"], one["result"]["commit_sha"])
    assert last["started_at"].endswith("Z") and last["finished_at"].endswith("Z") and last["duration_s"] > 0
    assert (runs[1]["status"], runs[1]["commit_sha"]) == ("failed", None) and runs[1]["env_status"] == "reused"

    stored = server.get_project_run(pid, "one")
    assert stored["result"] == one["result"] and stored["steps"] == one["steps"] and stored["status"] == "success"
    assert stored["step_timings"] == [{"step": s["name"], "duration_s": s["duration_s"]} for s in one["steps"]]
    assert stored["step_timings"][-1]["step"] == "commit to project"
    assert server.get_run("one")["result"]["diff"] == one["result"]["diff"]  # the old run id still answers
    assert server.get_run("bad")["status"] == bad["status"] == "failed"
    assert "interrupted" in server.get_project_run(pid, "cut")["result"]["error"]
    assert status_of(lambda: server.get_run("nope"), 404) and status_of(lambda: server.get_project_run(pid, "nope"), 404)
    assert "auth/domains.py" in server.project_diff(pid, "base")["diff"]

    assert server.delete_venv(pid) == {"deleted": True} and server.delete_venv(pid) == {"deleted": False}
    assert server.get_project(pid)["env"]["state"] == "missing"
    assert server.delete_project(pid) == {"deleted": True}
    assert server.list_projects() == [] and not projects.project_dir(pid).exists()
    status_of(lambda: server.get_project(pid), 404)


# ---- 5.6 #10 scoping -----------------------------------------------------------------------------
def test_another_users_project_is_404_everywhere(tmp_path, run, monkeypatch):
    src = copy_sample(tmp_path / "src")
    bobs = run(src, DOMAINS, "bobrun", scope="bob")["project_id"]
    anon = projects.ensure("local-anon", str(src))["project_id"]
    assert bobs != anon  # the same folder is a different project per user

    def calls(pid):
        return [lambda: server.get_project(pid), lambda: server.list_runs(pid), lambda: server.get_project_run(pid, "bobrun"),
                lambda: server.project_diff(pid, "base"), lambda: server.reset_project(pid, {"to": "base"}),
                lambda: server.sync_project(pid), lambda: server.export_project(pid, {"confirm": True}),
                lambda: server.project_pull_request(pid), lambda: server.delete_venv(pid), lambda: server.delete_project(pid)]

    repo_mod.set_token(TOKEN)
    monkeypatch.setitem(server.LOGINS, TOKEN, "alice")
    head = projects.get(bobs)["head_sha"]
    # exactly what a project id that does not exist answers: 404, never a 403 that would give its existence away
    assert [status_of(c, 404) for c in calls(bobs)] == [status_of(c, 404) for c in calls("0" * 16)]
    assert server.list_projects() == []
    status_of(lambda: server.get_run("bobrun"), 404)
    assert projects.get(bobs)["head_sha"] == head and envmgr.venv_dir(bobs).exists()  # and nothing happened to it
    assert not (src / "auth" / "domains.py").exists()

    repo_mod.set_token("")  # signed out: only local-anon projects exist
    assert [p["project_id"] for p in server.list_projects()] == [anon]
    status_of(lambda: server.get_project(bobs), 404)

    repo_mod.set_token(TOKEN)
    monkeypatch.setitem(server.LOGINS, TOKEN, "bob")
    assert [p["project_id"] for p in server.list_projects()] == [bobs] and server.get_project(bobs)["run_count"] == 1


# ---- 5.6 #11 local export ------------------------------------------------------------------------
def test_a_local_folder_changes_only_on_export_with_confirm_true(tmp_path, run):
    src = copy_sample(tmp_path / "src")
    (src / "auth" / "legacy.py").write_text("OLD = 1\n")
    before = tree(src)
    state = run(src, FIX, "one", "debug", TASK)
    assert state["status"] == "success", state["result"]["error"]
    pid, ws = state["project_id"], projects.workspace(state["project_id"])
    sh(ws, "rm", "-q", "auth/legacy.py"), sh(ws, "commit", "-q", "-m", "a later run removed a file")
    assert tree(src) == before and not (src / ".git").exists()

    for body in ({}, {"confirm": False}, {"confirm": "true"}, {"confirm": 1}):  # anything but a real true: patch file
        out = server.export_project(pid, body)
        patch = Path(out["patch_path"])
        assert set(out) == {"patch_path"} and patch.parent == projects.project_dir(pid) / "exports"
        assert "email.strip().lower()" in patch.read_text(encoding="utf-8")
        assert tree(src) == before
    for action in (lambda: server.reset_project(pid, {"to": "one"}), lambda: server.delete_venv(pid),
                   lambda: run(src, DOMAINS, "two"), lambda: server.reset_project(pid, {"to": "base"}),
                   lambda: server.reset_project(pid, {"to": "one"})):
        action()
        assert tree(src) == before  # no other project action reaches the original folder either
    sh(ws, "rm", "-q", "auth/legacy.py"), sh(ws, "commit", "-q", "-m", "removed again")
    projects.refresh(pid)

    assert server.export_project(pid, {"confirm": True}) == {"written_to": str(src.resolve())}
    after = tree(src)
    assert "email.strip().lower()" in after["auth/login.py"].decode() and "tests/test_login_email_case.py" in after
    assert "auth/legacy.py" not in after  # a deletion is exported too
    unchanged = set(before) - {"auth/login.py", "auth/legacy.py"}
    assert {k: after[k] for k in unchanged} == {k: before[k] for k in unchanged}
    assert set(after) == unchanged | {"auth/login.py", "tests/test_login_email_case.py"} and not (src / ".git").exists()
    github = projects.ensure("local-anon", "https://github.com/a/b", "mine")["project_id"]
    projects.set_fields(github, base_sha="b" * 40)
    assert "local folder projects" in status_of(lambda: server.export_project(github, {"confirm": True}), 400)


# ---- 5.6 #12 no secrets in the database -----------------------------------------------------------
def test_no_token_or_key_reaches_the_database(tmp_path, monkeypatch):
    bare, url, seed = make_origin(tmp_path)
    monkeypatch.setenv("GEMINI_API_KEY", KEY)
    monkeypatch.setenv("GH_TOKEN", TOKEN)
    repo_mod.set_token(TOKEN)
    monkeypatch.setitem(server.LOGINS, TOKEN, "alice")
    started = server.start_run({"repo": url, "task": f"{TASK}"})
    deadline = time.time() + 120
    while server.get_run(started["id"])["status"] == "running" or projects.is_busy(started["project_id"]):
        assert time.time() < deadline
        time.sleep(0.1)
    assert server.get_run(started["id"])["status"] == "success", server.get_run(started["id"])["result"]
    pid = started["project_id"]
    server.reset_project(pid, {"to": "base"}), server.sync_project(pid), server.get_project(pid)
    status_of(lambda: server.project_pull_request(pid), 400)  # nothing to publish after the reset
    # a URL with credentials in it: they are not stored, not even as the project's source
    leaky = projects.ensure("alice", f"https://alice:{TOKEN}@example.com/a/b.git", "mine")
    assert leaky["source"] == "https://example.com/a/b.git"
    failing = pipeline.run(f"https://alice:{TOKEN}@127.0.0.1:9/a/b.git", "x", scope="alice", kind="mine")
    assert failing["status"] == "failed" and TOKEN not in json.dumps(failing)

    for con in (projects.db(),):
        con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    home = tmp_path / "codefix_home"
    files = [p for p in home.rglob("*") if p.is_file() and "workspace" not in p.parts]
    names = {p.name for p in files}
    assert {"codefix.sqlite", "state.json", "report.md"} <= names
    for path in files:
        data = path.read_bytes()
        assert TOKEN.encode() not in data and KEY.encode() not in data, path
    rows = projects.db().execute("SELECT * FROM projects").fetchall() + projects.db().execute("SELECT * FROM runs").fetchall()
    assert rows and all("diff --git" not in str(v) and "def login" not in str(v) for row in rows for v in tuple(row))  # no file contents


# ---- cli -----------------------------------------------------------------------------------------
def test_cli_runs_on_the_project_and_can_reset_and_sync(tmp_path, monkeypatch, capsys):
    src = copy_sample(tmp_path / "src")
    monkeypatch.setattr(repo_mod, "whoami", lambda token=None: "")  # no gh login on this PC
    monkeypatch.setenv("FAKE_LLM_FILE", str(ROOT / "tests" / "fake_llm_tinyauth.json"))
    with pytest.raises(SystemExit) as done:
        cli.main([str(src), TASK])
    out = capsys.readouterr().out
    assert done.value.code == 0 and "STATUS: success" in out
    assert "env rebuilt (first run)" in out and "branch: codefix/src" in out
    pid = projects.ensure("local-anon", str(src))["project_id"]
    head = projects.get(pid)["head_sha"]
    assert f"head: {head}" in out
    with pytest.raises(SystemExit):
        cli.main(["--fork", str(src), TASK])  # the old flags are gone
    cli.main(["--sync", "--reset-to", "base", str(src)])
    out = capsys.readouterr().out
    assert "reset: project head is now" in out and "codefix/archive/" in out and "sync: not_applicable" in out
    assert projects.get(pid)["head_sha"] == projects.get(pid)["base_sha"] != head
    with pytest.raises(SystemExit) as bad:
        cli.main(["--reset-to", "nope", str(src)])
    assert "ERROR" in str(bad.value.code)
