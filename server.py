"""FastAPI server: /api/me, /api/session, /api/repos, POST /api/run, GET /api/run/{id}, POST /api/run/{id}/approve,
POST /api/run/{id}/pr, static frontend.
Run: python server.py"""
import threading
import uuid
from pathlib import Path

from fastapi import Body, FastAPI, Header, HTTPException
from fastapi.staticfiles import StaticFiles

from agent import pipeline
from agent import repo as repo_mod
from agent.repo import is_url

app = FastAPI()
RUNS = {}  # ponytail: in-memory, lost on restart; reports persist in runs/<id>/report.md
WAITING = {}  # run id -> {"event": Event, "choice": str} while a run waits for the user's approval
APPROVAL_TIMEOUT = 3600  # an unanswered question falls back to "local" after an hour
TASKS = {}  # run id -> task text, for the pull request title and body
PR_LOCK = threading.Lock()


ORIGINS = {"http://localhost:8000", "http://127.0.0.1:8000"}


@app.get("/api/me")
def me():
    """Who GitHub actions run as: the page's GitHub sign-in. A fresh server is signed out; the gh CLI login
    of this PC is deliberately not used by the page (only by cli.py)."""
    login = repo_mod.whoami() if repo_mod.current_token() else ""
    return {"login": login, "signed_in": bool(login), "via": "github" if login else ""}


def need_sign_in():
    # Without this, a signed-out page would quietly act on GitHub as the PC's gh CLI login.
    if not repo_mod.current_token():
        raise HTTPException(401, "Sign in with GitHub first (top right of the page).")


def same_origin(origin):
    # Without this, any website open in the browser could plant (or clear) a token on the local server.
    if origin not in ORIGINS:
        raise HTTPException(403, "Sign-in is only accepted from this page.")


@app.post("/api/session")
def sign_in(body: dict = Body(...), origin: str = Header(None)):
    """Accept the GitHub access token the page got from Firebase's GitHub sign-in. Kept in memory only."""
    same_origin(origin)
    token = body.get("github_token")
    if not isinstance(token, str) or not 20 <= len(token) <= 400 or not token.isascii() or any(c.isspace() for c in token):
        raise HTTPException(400, "Sign-in did not return a usable GitHub token.")
    login = repo_mod.whoami(token)  # GitHub itself says whose token this is
    if not login:
        raise HTTPException(400, "GitHub did not accept the sign-in token.")
    repo_mod.set_token(token)
    return {"login": login}


@app.delete("/api/session")
def sign_out(origin: str = Header(None)):
    same_origin(origin)
    repo_mod.set_token("")
    return {"ok": True}


@app.get("/api/repos")
def repos():
    need_sign_in()
    try:
        return repo_mod.my_repos()
    except RuntimeError as e:
        raise HTTPException(400, f"Could not list your GitHub repositories (run `gh auth login`): {e}")


def choose(mode, repo):
    """Validate the page's mode against the repo. Returns the pipeline choice (None = decide automatically)."""
    if mode is None:
        if not is_url(repo) and not Path(repo).is_dir():
            raise HTTPException(400, f"Repository not found: {repo} (give a folder path or a git URL).")
        return None
    if mode == "local":
        if is_url(repo) or not Path(repo).is_dir():
            raise HTTPException(400, f"Folder not found: {repo}")
        return "own"
    if mode not in ("own", "other"):
        raise HTTPException(400, "mode must be own, other or local.")
    if not repo_mod.github_slug(repo):
        raise HTTPException(400, "Give a GitHub repository address like https://github.com/owner/name")
    kind = repo_mod.access(repo)
    if kind == "missing":
        raise HTTPException(400, "Repository not found on GitHub (or it is private and not yours).")
    if kind == "nogh":
        raise HTTPException(400, "Could not check GitHub access. Is the GitHub CLI signed in (`gh auth login`) and online?")
    if mode == "own" and kind != "write":
        raise HTTPException(400, "You can't write to this repository. Choose \"Someone else's public repo\" to fork it.")
    if mode == "other" and kind == "write":
        raise HTTPException(400, "You can already write to this repository. Choose \"My GitHub repo\".")
    return "origin" if mode == "own" else "fork"


@app.post("/api/run")
def start_run(body: dict = Body(...)):
    repo, task = str(body.get("repo") or "").strip(), str(body.get("task") or "").strip()
    if not repo or not task:
        raise HTTPException(400, "Both a repository and a task are required.")
    task_type = body.get("task_type") or "debug"
    if task_type not in pipeline.MODES:
        raise HTTPException(400, "task_type must be debug or feature.")
    if is_url(repo) or body.get("mode") in ("own", "other"):
        need_sign_in()
    choice = choose(body.get("mode"), repo)
    run_id = uuid.uuid4().hex[:8]
    RUNS[run_id] = {"id": run_id, "status": "running", "approval": None, "steps": [], "result": {}}
    WAITING[run_id] = wait = {"event": threading.Event(), "choice": "local"}
    TASKS[run_id] = task

    def ask(options):
        wait["event"].wait(APPROVAL_TIMEOUT)
        return wait["choice"]

    token = repo_mod.current_token()

    def work():
        repo_mod.bind_token(token)  # the run acts as whoever started it, even if they sign out meanwhile
        pipeline.run(repo, task, run_id=run_id, ask=ask, choice=choice, task_type=task_type,
                     on_step=lambda s: RUNS.__setitem__(run_id, s))

    threading.Thread(target=work, daemon=True).start()
    return {"id": run_id}


@app.get("/api/run/{run_id}")
def get_run(run_id: str):
    if run_id not in RUNS:
        raise HTTPException(404, "Unknown run id.")
    return RUNS[run_id]


@app.post("/api/run/{run_id}/approve")
def approve(run_id: str, body: dict = Body(...)):
    if run_id not in RUNS:
        raise HTTPException(404, "Unknown run id.")
    state = RUNS[run_id]
    if state["status"] != "awaiting_approval":
        raise HTTPException(400, "This run is not waiting for an answer.")
    choice = body.get("choice")
    if choice not in {o["id"] for o in state["approval"]["options"]}:
        raise HTTPException(400, f"choice must be one of {[o['id'] for o in state['approval']['options']]}")
    WAITING[run_id]["choice"] = choice
    WAITING[run_id]["event"].set()
    return {"ok": True}


@app.post("/api/run/{run_id}/pr")
def open_pull_request(run_id: str):
    """Open the pull request for a finished run. Only ever called by the user clicking the button."""
    if run_id not in RUNS:
        raise HTTPException(404, "Unknown run id.")
    state = RUNS[run_id]
    r = state["result"]
    if state["status"] != "success" or not r.get("pr"):
        raise HTTPException(400, "This run has no pushed branch to open a pull request from.")
    need_sign_in()
    with PR_LOCK:  # a double click must not open two
        if not r["pr_opened_url"]:
            task = TASKS.get(run_id, "")
            body = (f"{r['explanation']}\n\n"
                    f"**Task:** {task}\n\n"
                    f"| | Passed | Failed | Total |\n| --- | --- | --- | --- |\n"
                    f"| Before | {r['baseline']['passed']} | {r['baseline']['failed']} | {r['baseline']['total']} |\n"
                    f"| After | {r['after']['passed']} | {r['after']['failed']} | {r['after']['total']} |\n\n"
                    f"Regressions: {len(r['regressions'])}. New tests: {', '.join(r['new_tests']) or 'none'}.\n\n"
                    "_This change was written and tested by an AI software engineering agent (HackNEX PSI09 "
                    "prototype) and submitted by the account owner. Please review before merging._")
            try:
                r["pr_opened_url"] = repo_mod.open_pr(r["pr"], f"agent: {task[:60]}", body)
            except RuntimeError as e:
                raise HTTPException(400, f"Could not open the pull request: {e}")
    return {"url": r["pr_opened_url"]}


class NoCacheFiles(StaticFiles):
    """The page changes while we develop; a stale cached app.js shows the wrong UI for a new status."""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-store"
        return response


# The React page is built by `npm run build` in frontend/ (see README); dist/ is committed so Node is optional.
app.mount("/", NoCacheFiles(directory=Path(__file__).parent / "frontend" / "dist", html=True))

if __name__ == "__main__":
    import uvicorn

    # 127.0.0.1 only: this server executes the test suites of whatever repo it is given.
    uvicorn.run(app, host="127.0.0.1", port=8000)
