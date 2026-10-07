"""Mode picker, sign-in stand-in and pull-request endpoint. Fast: no network, no venv, gh is faked."""
import json
import types

import pytest
from fastapi import HTTPException

import server
from agent import pipeline
from agent import repo as repo_mod

MINE = "https://github.com/me/mine"
THEIRS = "https://github.com/them/theirs"


def status_of(call):
    with pytest.raises(HTTPException) as e:
        call()
    assert e.value.status_code == 400
    return e.value.detail


@pytest.fixture
def access(monkeypatch):
    """Fake GitHub permissions: write on MINE, none on THEIRS, anything else missing."""
    kinds = {MINE: "write", THEIRS: "none"}
    monkeypatch.setattr(repo_mod, "access", lambda src: kinds.get(src, "missing"))
    return kinds


def test_mode_maps_to_choice(access, tmp_path):
    assert server.choose("own", MINE) == "origin"      # own repo: branch + commit
    assert server.choose("other", THEIRS) == "fork"    # someone else's: fork + commit
    assert server.choose("local", str(tmp_path)) == "own"
    assert server.choose(None, MINE) is None           # no mode: pipeline decides (CLI behaviour)


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
def signed_in():
    repo_mod.set_token(TOKEN)
    yield
    repo_mod.set_token("")


def test_start_run_passes_choice_to_pipeline(access, monkeypatch, signed_in):
    seen = {}
    monkeypatch.setattr(pipeline, "run", lambda repo, task, **kw: seen.update(repo=repo, task=task, **kw))
    run_id = server.start_run({"mode": "other", "repo": THEIRS, "task": "fix it"})["id"]
    for _ in range(200):
        if seen:
            break
        __import__("time").sleep(0.01)
    assert (seen["repo"], seen["choice"], seen["run_id"]) == (THEIRS, "fork", run_id)
    assert seen["task_type"] == "debug"  # the default
    assert "required" in status_of(lambda: server.start_run({"mode": "own", "repo": "", "task": "x"}))
    assert "task_type must be" in status_of(
        lambda: server.start_run({"mode": "own", "repo": MINE, "task": "x", "task_type": "refactor"}))
    seen.clear()
    server.start_run({"mode": "own", "repo": MINE, "task": "add x", "task_type": "feature"})
    for _ in range(200):
        if seen:
            break
        __import__("time").sleep(0.01)
    assert (seen["task_type"], seen["choice"]) == ("feature", "origin")


def test_preset_choice_skips_access_check_and_question(monkeypatch, tmp_path):
    monkeypatch.setattr(repo_mod, "access", lambda src: pytest.fail("access must not be checked again"))
    monkeypatch.setattr(repo_mod, "prepare", lambda *a: (_ for _ in ()).throw(RuntimeError("stop here")))
    state = pipeline.run(THEIRS, "t", runs_dir=tmp_path, choice="fork", ask=lambda o: pytest.fail("must not ask"))
    assert state["steps"][0] == {"name": "access", "status": "ok",
                                 "detail": "someone else's repo: fork to your account and commit there"}
    assert state["status"] == "failed" and "stop here" in state["result"]["error"]
    assert state["result"]["pr"] is None and state["result"]["pr_opened_url"] == ""


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
    finished_run({"repo": "them/theirs", "head": "me:agent-changes", "base": "main"})
    for call in (server.repos, lambda: server.open_pull_request("r1"),
                 lambda: server.start_run({"mode": "own", "repo": MINE, "task": "x"}),
                 lambda: server.start_run({"repo": THEIRS, "task": "x"})):
        with pytest.raises(HTTPException) as e:
            call()
        assert e.value.status_code == 401
    assert calls == []
    assert server.start_run({"mode": "local", "repo": str(tmp_path), "task": "x"})["id"]  # local needs no sign-in


def finished_run(pr):
    result = {"explanation": "Fixed it.", "baseline": {"passed": 6, "failed": 0, "total": 6},
              "after": {"passed": 7, "failed": 0, "total": 7}, "regressions": [], "new_tests": ["t::new"],
              "pr": pr, "pr_opened_url": ""}
    server.RUNS["r1"] = {"id": "r1", "status": "success", "result": result}
    server.TASKS["r1"] = "login fails with capitals"
    return result


def test_pull_request_is_opened_once_with_the_right_arguments(monkeypatch, signed_in):
    url = "https://github.com/them/theirs/pull/7"
    calls = fake_gh(monkeypatch, lambda a: (0, url + "\n", ""))
    finished_run({"repo": "them/theirs", "head": "me:agent-changes", "base": "main"})
    assert server.open_pull_request("r1") == {"url": url}
    assert server.open_pull_request("r1") == {"url": url}  # second click: same PR, no second call
    assert len(calls) == 1
    args = calls[0]
    assert args[:8] == ["pr", "create", "--repo", "them/theirs", "--head", "me:agent-changes", "--base", "main"]
    assert args[args.index("--title") + 1] == "agent: login fails with capitals"
    body = args[args.index("--body") + 1]
    assert "Fixed it." in body and "| After | 7 | 0 | 7 |" in body and "AI software engineering agent" in body


def test_existing_pull_request_is_reused(monkeypatch, signed_in):
    fake_gh(monkeypatch, lambda a: (1, "", "a pull request for branch already exists:\nhttps://github.com/them/theirs/pull/3"))
    finished_run({"repo": "them/theirs", "head": "me:agent-changes", "base": "main"})
    assert server.open_pull_request("r1") == {"url": "https://github.com/them/theirs/pull/3"}


def test_pull_request_refused_without_a_pushed_branch(monkeypatch, signed_in):
    calls = fake_gh(monkeypatch, lambda a: (0, "", ""))
    finished_run(None)
    assert "no pushed branch" in status_of(lambda: server.open_pull_request("r1"))
    finished_run({"repo": "them/theirs", "head": "me:agent-changes", "base": "main"})
    server.RUNS["r1"]["status"] = "failed"
    assert "no pushed branch" in status_of(lambda: server.open_pull_request("r1"))
    fake_gh(monkeypatch, lambda a: (1, "", "GraphQL: No commits between main and agent-changes"))
    server.RUNS["r1"]["status"] = "success"
    assert "Could not open" in status_of(lambda: server.open_pull_request("r1"))
    assert calls == []


# ---- sign-in session -------------------------------------------------------------------------------
HERE = "http://localhost:8000"
TOKEN = "gho_" + "x" * 36


@pytest.fixture
def signed_out():
    repo_mod.set_token("")
    yield
    repo_mod.set_token("")


def captured_env(monkeypatch):
    """Record the command and environment of every subprocess repo.py starts."""
    seen = []

    def run(cmd, **kw):
        seen.append((cmd, kw["env"]))
        return types.SimpleNamespace(returncode=1, stdout="", stderr=f"fatal: bad credentials {TOKEN}")

    monkeypatch.setattr(repo_mod.subprocess, "run", run)
    return seen


def test_sign_in_stores_a_valid_token_and_sign_out_clears_it(monkeypatch, signed_out):
    monkeypatch.setattr(repo_mod, "whoami", lambda token=None: "octocat" if (token or repo_mod.current_token()) == TOKEN else "")
    assert server.sign_in({"github_token": TOKEN}, origin=HERE) == {"login": "octocat"}
    assert repo_mod.current_token() == TOKEN
    assert server.me() == {"login": "octocat", "signed_in": True, "via": "github"}
    assert server.sign_out(origin=HERE) == {"ok": True}
    assert repo_mod.current_token() == "" and server.me()["via"] == ""


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
