"""Mode picker, sign-in stand-in and the project pull-request endpoint. Fast: no network, no venv, gh is faked."""
import json
import types

import pytest
from fastapi import HTTPException

import server
from agent import pipeline, projects
from agent import repo as repo_mod
from agent import sandbox

MINE = "https://github.com/me/mine"
THEIRS = "https://github.com/them/theirs"


def status_of(call, code=400):
    with pytest.raises(HTTPException) as e:
        call()
    assert e.value.status_code == code
    return e.value.detail


@pytest.fixture
def access(monkeypatch):
    """Fake GitHub permissions: write on MINE, none on THEIRS, anything else missing."""
    kinds = {MINE: "write", THEIRS: "none"}
    monkeypatch.setattr(repo_mod, "access", lambda src: kinds.get(src, "missing"))
    return kinds


def test_mode_maps_to_project_kind(access, tmp_path):
    assert server.choose("own", MINE) == "mine"        # own repo
    assert server.choose("other", THEIRS) == "others"  # someone else's: forked only when publishing
    assert server.choose("local", str(tmp_path)) == "local"
    assert server.choose(None, MINE) is None           # no mode: the run's access step decides (CLI behaviour)


def test_wrong_mode_is_refused_with_a_readable_message(access, tmp_path):
    assert "can't write" in status_of(lambda: server.choose("own", THEIRS))
    assert "already write" in status_of(lambda: server.choose("other", MINE))
    assert "not found" in status_of(lambda: server.choose("other", "https://github.com/no/such"))
    assert "GitHub repository address" in status_of(lambda: server.choose("own", str(tmp_path)))
    assert "Folder not found" in status_of(lambda: server.choose("local", MINE))
    assert "mode must be" in status_of(lambda: server.choose("banana", MINE))
    access[MINE] = "nogh"
    assert "gh auth login" in status_of(lambda: server.choose("own", MINE))


@pytest.fixture
def signed_in(monkeypatch):
    repo_mod.set_token(TOKEN)
    monkeypatch.setitem(server.LOGINS, TOKEN, "me")  # what sign_in() records: no GitHub call per request
    yield
    repo_mod.set_token("")


def wait_for(seen):
    for _ in range(200):
        if seen:
            break
        __import__("time").sleep(0.01)


def test_start_run_passes_kind_and_project_to_pipeline(access, monkeypatch, signed_in):
    seen = {}
    monkeypatch.setattr(pipeline, "run", lambda repo, task, **kw: seen.update(repo=repo, task=task, **kw))
    started = server.start_run({"mode": "other", "repo": THEIRS, "task": "fix it"})
    wait_for(seen)
    assert (seen["repo"], seen["kind"], seen["run_id"], seen["scope"], seen["locked"]) == (THEIRS, "others", started["id"], "me", True)
    assert seen["task_type"] == "debug"  # the default
    assert started["project_id"] == projects.project_id("me", "github:them/theirs")
    assert server.get_run(started["id"])["project_id"] == started["project_id"]
    assert "required" in status_of(lambda: server.start_run({"mode": "own", "repo": "", "task": "x"}))
    assert "task_type must be" in status_of(
        lambda: server.start_run({"mode": "own", "repo": MINE, "task": "x", "task_type": "refactor"}))
    seen.clear()
    server.start_run({"mode": "own", "repo": MINE, "task": "add x", "task_type": "feature"})
    wait_for(seen)
    assert (seen["task_type"], seen["kind"]) == ("feature", "mine")


def test_given_kind_skips_the_access_check(monkeypatch):
    monkeypatch.setattr(repo_mod, "access", lambda src: pytest.fail("access must not be checked again"))
    monkeypatch.setattr(repo_mod, "prepare", lambda *a: (_ for _ in ()).throw(RuntimeError("stop here")))
    state = pipeline.run(THEIRS, "t", kind="others")
    first = state["steps"][0]
    assert (first["name"], first["status"], first["detail"]) == ("access", "ok", pipeline.PRESET["others"])
    assert state["status"] == "failed" and "stop here" in state["result"]["error"]
    assert state["result"]["pr"] is None and state["result"]["pr_opened_url"] == ""
    assert projects.get(state["project_id"])["display_name"] == "them/theirs"


def fake_gh(monkeypatch, reply):
    calls = []

    def gh(args, check=True, token=None):
        calls.append(args)
        code, out, err = reply(args)
        if check and code:
            raise RuntimeError(err)
        return types.SimpleNamespace(returncode=code, stdout=out, stderr=err)

    monkeypatch.setattr(repo_mod, "gh", gh)
    return calls


def test_me_and_repos(monkeypatch, signed_in):
    fake_gh(monkeypatch, lambda a: (0, "me\n", "") if a[0] == "api" else
            (0, json.dumps([{"nameWithOwner": "me/mine", "url": MINE, "isPrivate": True}]), ""))
    assert server.me() == {"login": "me", "signed_in": True, "via": "github"}
    assert server.repos() == [{"name": "me/mine", "url": MINE, "private": True}]
    fake_gh(monkeypatch, lambda a: (1, "", "not logged in"))
    assert server.me() == {"login": "", "signed_in": False, "via": ""}
    assert "gh auth login" in status_of(server.repos)


def test_signed_out_page_never_uses_the_cli_login(monkeypatch, access, signed_out, tmp_path):
    calls = fake_gh(monkeypatch, lambda a: (0, "cli-user\n", ""))  # the PC's gh login would answer
    monkeypatch.setattr(pipeline, "run", lambda *a, **kw: None)
    assert server.me() == {"login": "", "signed_in": False, "via": ""}
    pid = published_project("cli-user", monkeypatch)[0]
    for call in (server.repos, lambda: server.project_pull_request(pid),
                 lambda: server.start_run({"mode": "own", "repo": MINE, "task": "x"}),
                 lambda: server.start_run({"repo": THEIRS, "task": "x"})):
        status_of(call, 401)
    assert server.list_projects() == []  # signed out: the gh login's projects are not shown either
    assert calls == []
    assert server.start_run({"mode": "local", "repo": str(tmp_path), "task": "x"})["id"]  # local needs no sign-in
    assert calls == []


def published_project(scope, monkeypatch, src=THEIRS, kind="others"):
    """A project with one successful run's worth of changes, without cloning anything. Returns (id, pushes)."""
    pid = projects.ensure(scope, src, kind)["project_id"]
    projects.set_fields(pid, base_ref="main", base_sha="b" * 40, head_sha="h" * 40, ahead=1)
    state = {"id": "r1", "project_id": pid, "status": "success", "started_at": projects.now(), "finished_at": projects.now(),
             "duration_s": 1.0, "steps": [], "result": {"task_type": "debug", "head_before": "b" * 40, "commit_sha": "h" * 40,
                                                         "env_status": "reused", "env_reason": None, "attempts": 1}}
    projects.start_run(state, "login fails with capitals\nmore detail")
    projects.save_run(state)
    pushes = []

    def publish(source, clone, branch, kind, lease=None):
        pushes.append({"source": source, "branch": branch, "kind": kind, "lease": lease})
        return {"repo": "them/theirs", "head": f"me:{branch}", "base": "main"}

    monkeypatch.setattr(repo_mod, "publish", publish)
    return pid, pushes


def test_pull_request_is_opened_once_per_project_with_the_right_arguments(monkeypatch, signed_in):
    url = "https://github.com/them/theirs/pull/7"
    calls = fake_gh(monkeypatch, lambda a: (0, url + "\n", ""))
    pid, pushes = published_project("me", monkeypatch)
    assert server.project_pull_request(pid) == {"url": url}
    assert server.project_pull_request(pid) == {"url": url}  # second click: same PR, no second push or gh call
    assert len(calls) == 1 and pushes == [{"source": THEIRS, "branch": "codefix/theirs", "kind": "others", "lease": None}]
    args = calls[0]
    assert args[:8] == ["pr", "create", "--repo", "them/theirs", "--head", "me:codefix/theirs", "--base", "main"]
    assert args[args.index("--title") + 1] == "codefix: login fails with capitals"
    body = args[args.index("--body") + 1]
    assert "- login fails with capitals" in body and "AI software engineering agent" in body
    assert server.get_project(pid)["pr_url"] == url

    # a later run moved the head: the branch is pushed again and the SAME pull request comes back
    projects.set_fields(pid, head_sha="n" * 40)
    fake_gh(monkeypatch, lambda a: (1, "", f"a pull request for branch already exists:\n{url}"))
    assert server.project_pull_request(pid) == {"url": url}
    assert len(pushes) == 2 and pushes[1]["lease"] is None  # an ordinary push, not forced


def test_push_is_forced_with_lease_only_right_after_a_sync_rebase(monkeypatch, signed_in):
    fake_gh(monkeypatch, lambda a: (0, "https://github.com/them/theirs/pull/7\n", ""))
    pid, pushes = published_project("me", monkeypatch)
    server.project_pull_request(pid)
    projects.set_fields(pid, head_sha="r" * 40, force_next_push=1)  # what a sync that rewrote pushed commits leaves
    server.project_pull_request(pid)
    assert pushes[1]["lease"] == "h" * 40  # only if the remote still holds what we pushed
    projects.set_fields(pid, head_sha="s" * 40)
    server.project_pull_request(pid)
    assert pushes[2]["lease"] is None  # the flag is spent: back to plain pushes


def test_existing_pull_request_is_reused(monkeypatch, signed_in):
    fake_gh(monkeypatch, lambda a: (1, "", "a pull request for branch already exists:\nhttps://github.com/them/theirs/pull/3"))
    pid, _ = published_project("me", monkeypatch)
    assert server.project_pull_request(pid) == {"url": "https://github.com/them/theirs/pull/3"}


def test_pull_request_refused_when_there_is_nothing_to_publish(monkeypatch, signed_in, tmp_path):
    calls = fake_gh(monkeypatch, lambda a: (0, "", ""))
    pid, pushes = published_project("me", monkeypatch)
    projects.set_fields(pid, ahead=0)
    assert "no changes yet" in status_of(lambda: server.project_pull_request(pid))
    local = projects.ensure("me", str(tmp_path), "local")["project_id"]
    assert "Run a task on it first" in status_of(lambda: server.project_pull_request(local))
    projects.set_fields(local, base_sha="b" * 40, ahead=1)
    assert "Export" in status_of(lambda: server.project_pull_request(local))
    assert calls == [] and pushes == []
    projects.set_fields(pid, ahead=1)
    fake_gh(monkeypatch, lambda a: (1, "", "GraphQL: No commits between main and codefix/theirs"))
    assert "Could not open the pull request" in status_of(lambda: server.project_pull_request(pid))
    with projects.hold(pid):  # a run is going
        assert status_of(lambda: server.project_pull_request(pid), 409) == projects.BUSY


def test_push_failure_is_a_readable_400_without_the_token(monkeypatch, signed_in):
    pid, _ = published_project("me", monkeypatch)
    monkeypatch.setattr(repo_mod, "publish", lambda *a: (_ for _ in ()).throw(RuntimeError("push failed: remote: denied")))
    detail = status_of(lambda: server.project_pull_request(pid))
    assert "Could not open the pull request: push failed: remote: denied" == detail and TOKEN not in detail
    assert projects.get(pid)["pushed_sha"] is None


def test_fork_push_goes_to_the_users_fork_never_to_the_owner(monkeypatch, signed_in, tmp_path):
    fake_gh(monkeypatch, lambda a: (0, "me/theirs\n", ""))
    pushed = []
    monkeypatch.setattr(repo_mod, "git", lambda args, cwd, check=True: pushed.append(args) or "origin/main\n")
    pr = repo_mod.publish(THEIRS, tmp_path, "codefix/theirs", "others")
    assert pr == {"repo": "them/theirs", "head": "me:codefix/theirs", "base": "main"}
    assert [a for a in pushed if a[0] == "push"] == [["push", "https://github.com/me/theirs.git", "codefix/theirs"]]
    pushed.clear()
    assert repo_mod.publish(MINE, tmp_path, "codefix/mine", "mine", lease="abc")["head"] == "codefix/mine"
    assert [a for a in pushed if a[0] == "push"] == [["push", "--force-with-lease=codefix/mine:abc", "origin", "codefix/mine"]]


# ---- requests from other websites ----------------------------------------------------------------
def test_state_changing_requests_from_other_websites_are_refused(tmp_path):
    assert server.foreign_origin("POST", "https://evil.example")
    assert server.foreign_origin("DELETE", "http://localhost.evil.example:8000")
    assert not server.foreign_origin("GET", "https://evil.example")  # reading needs CORS, which is not granted
    for origin in (None, "http://localhost:8000", "http://127.0.0.1:8000", "http://localhost:5173"):
        assert not server.foreign_origin("POST", origin)
    pytest.importorskip("httpx")
    from fastapi.testclient import TestClient
    client = TestClient(server.app, base_url="http://localhost:8000")
    # DNS rebinding: a page on another name that resolves to this machine may not even read
    assert TestClient(server.app, base_url="http://evil.example:8000").get("/api/projects").status_code == 403
    pid = projects.ensure("local-anon", str(tmp_path), "local")["project_id"]
    for method, path in (("POST", "/api/run"), ("POST", f"/api/projects/{pid}/sync"), ("DELETE", f"/api/projects/{pid}")):
        assert client.request(method, path, headers={"origin": "https://evil.example"}).status_code == 403
    assert projects.get(pid)  # still there
    # and the routes the page uses exist under the agreed paths
    assert client.get("/api/projects").json()[0]["project_id"] == pid
    assert client.get(f"/api/projects/{pid}").json()["base_label"] == f"snapshot of {tmp_path.name}"
    assert client.get(f"/api/projects/{pid}/runs").json() == []
    assert client.get(f"/api/projects/{pid}/runs/nope").status_code == 404
    assert client.get(f"/api/projects/{pid}/diff?from=base").json() == {"diff": ""}
    assert client.post(f"/api/projects/{pid}/sync", headers={"origin": "http://localhost:8000"}).json() == {"status": "not_applicable"}
    assert client.post(f"/api/projects/{pid}/reset", json={"to": "base"}).status_code == 400  # no workspace yet
    assert client.post(f"/api/projects/{pid}/export").status_code == 400
    assert client.post(f"/api/projects/{pid}/pr").status_code == 401
    assert client.post("/api/run/x/approve", json={"choice": "local"}).status_code in (404, 405)  # removed
    assert client.delete(f"/api/projects/{pid}/venv").json() == {"deleted": False}
    assert client.delete(f"/api/projects/{pid}").json() == {"deleted": True}
    assert client.get(f"/api/projects/{pid}").status_code == 404


# ---- sign-in session -------------------------------------------------------------------------------
HERE = "http://localhost:8000"
TOKEN = "gho_" + "x" * 36


@pytest.fixture
def signed_out():
    repo_mod.set_token("")
    yield
    repo_mod.set_token("")


def captured_env(monkeypatch):
    """Record the command and environment of every subprocess repo.py starts (through agent/sandbox.py)."""
    seen = []

    def run(cmd, **kw):
        seen.append((cmd, kw["env"]))
        return types.SimpleNamespace(returncode=1, stdout="", stderr=f"fatal: bad credentials {TOKEN}")

    monkeypatch.setattr(sandbox.subprocess, "run", run)
    return seen


def test_sign_in_stores_a_valid_token_and_sign_out_clears_it(monkeypatch, signed_out):
    monkeypatch.setattr(repo_mod, "whoami", lambda token=None: "octocat" if (token or repo_mod.current_token()) == TOKEN else "")
    assert server.sign_in({"github_token": TOKEN}, origin=HERE) == {"login": "octocat"}
    assert repo_mod.current_token() == TOKEN
    assert server.me() == {"login": "octocat", "signed_in": True, "via": "github"}
    assert server.scope() == "octocat"
    assert server.sign_out(origin=HERE) == {"ok": True}
    assert repo_mod.current_token() == "" and server.me()["via"] == ""
    assert server.scope() == "local-anon" and server.LOGINS == {}


def test_a_token_github_rejects_is_not_a_scope(monkeypatch, signed_out):
    monkeypatch.setattr(repo_mod, "whoami", lambda token=None: "")
    repo_mod.set_token(TOKEN)
    assert "Sign in again" in status_of(server.list_projects, 401)  # not quietly treated as the signed-out user


def test_sign_in_refuses_bad_tokens_and_other_origins(monkeypatch, signed_out):
    monkeypatch.setattr(repo_mod, "whoami", lambda token=None: "")
    assert "did not accept" in status_of(lambda: server.sign_in({"github_token": TOKEN}, origin=HERE))
    for bad in (None, "", "short", "has space " + TOKEN, 123):
        assert "usable GitHub token" in status_of(lambda: server.sign_in({"github_token": bad}, origin=HERE))
    for origin in ("https://evil.example", None):
        with pytest.raises(HTTPException) as e:
            server.sign_in({"github_token": TOKEN}, origin=origin)
        assert e.value.status_code == 403
        with pytest.raises(HTTPException) as e:
            server.sign_out(origin=origin)
        assert e.value.status_code == 403
    assert repo_mod.current_token() == ""


def test_token_reaches_git_and_gh_only_while_signed_in_and_never_leaks(monkeypatch, signed_out, tmp_path):
    seen = captured_env(monkeypatch)
    monkeypatch.delenv("GH_TOKEN", raising=False)
    repo_mod.git(["status"], cwd=tmp_path, check=False)
    repo_mod.gh(["api", "user"], check=False)
    assert all("GH_TOKEN" not in env for _, env in seen)
    assert not any("credential.helper=!gh auth git-credential" in cmd for cmd, _ in seen)

    seen.clear()
    repo_mod.set_token(TOKEN)
    for call in (lambda: repo_mod.git(["push"], cwd=tmp_path), lambda: repo_mod.gh(["api", "user"])):
        with pytest.raises(RuntimeError) as e:
            call()
        assert TOKEN not in str(e.value) and "***" in str(e.value)  # scrubbed from error text
    (git_cmd, git_env), (gh_cmd, gh_env) = seen
    assert git_env["GH_TOKEN"] == gh_env["GH_TOKEN"] == TOKEN
    assert "credential.helper=!gh auth git-credential" in git_cmd
    assert not any(TOKEN in part for part in git_cmd + gh_cmd)  # only in the environment, never on a command line


def test_a_run_keeps_the_token_it_started_with(signed_out):
    import threading
    repo_mod.set_token(TOKEN)
    inside = []

    def work():
        repo_mod.bind_token(TOKEN)
        repo_mod.set_token("")  # the user signs out while the run is going
        inside.append(repo_mod.current_token())

    thread = threading.Thread(target=work)
    thread.start()
    thread.join()
    assert inside == [TOKEN] and repo_mod.current_token() == ""
