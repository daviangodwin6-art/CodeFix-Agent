"""FastAPI server: /api/me, /api/session, /api/repos, POST /api/run, GET /api/run/{id}, /api/projects/... , static frontend.
Run: python server.py"""
import threading
import uuid
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import Body, FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from agent import envmgr, pipeline, projects
from agent import repo as repo_mod
from agent.repo import is_url

app = FastAPI()
RUNS = {}  # live state for polling while a run is going; history is in the database (agent/projects.py)
LOGINS = {}  # token -> GitHub login, memory only, so project requests do not ask GitHub every time

ORIGINS = {"http://localhost:8000", "http://127.0.0.1:8000"}


LOCAL = ("localhost", "127.0.0.1")


def foreign_origin(method, origin):
    """Is this a state-changing request sent by some other website open in the browser?"""
    return method not in ("GET", "HEAD", "OPTIONS") and bool(origin) and urlsplit(origin).hostname not in ("localhost", "127.0.0.1")


@app.middleware("http")
async def refuse_other_sites(request: Request, call_next):
    # Project ids can be worked out from a login and a repo name, so "unguessable id" protects nothing:
    # without this any web page could start a run, push a branch or delete a project on this machine.
    # The Host check stops DNS rebinding: a page on evil.example that resolves to 127.0.0.1 could otherwise
    # read projects, diffs and the repo list with plain GET requests.
    host = urlsplit("//" + request.headers.get("host", "")).hostname
    if host not in LOCAL or foreign_origin(request.method, request.headers.get("origin")):
        return JSONResponse({"detail": "This request is only accepted from the CodeFix page."}, status_code=403)
    return await call_next(request)


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


def scope():
    """Whose projects this request may see: the signed-in GitHub login, or local-anon when signed out."""
    token = repo_mod.current_token()
    if not token:
        return "local-anon"
    if not LOGINS.get(token):
        LOGINS[token] = repo_mod.whoami()
    if not LOGINS[token]:
        raise HTTPException(401, "GitHub no longer accepts this sign-in. Sign in again.")
    return LOGINS[token]


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
    LOGINS[token] = login
    return {"login": login}


@app.delete("/api/session")
def sign_out(origin: str = Header(None)):
    same_origin(origin)
    repo_mod.set_token("")
    LOGINS.clear()
    return {"ok": True}


@app.get("/api/repos")
def repos():
    need_sign_in()
    try:
        return repo_mod.my_repos()
    except RuntimeError as e:
        raise HTTPException(400, f"Could not list your GitHub repositories (run `gh auth login`): {e}")


def choose(mode, repo):
    """Validate the page's mode against the repo. Returns the project kind (None = the run's access step decides)."""
    if mode is None:
        if not is_url(repo) and not Path(repo).is_dir():
            raise HTTPException(400, f"Repository not found: {repo} (give a folder path or a git URL).")
        return None
    if mode == "local":
        if is_url(repo) or not Path(repo).is_dir():
            raise HTTPException(400, f"Folder not found: {repo}")
        return "local"
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
    return "mine" if mode == "own" else "others"


@app.post("/api/run")
def start_run(body: dict = Body(...)):
    """Start a run on the project for this repository (created on first use); it continues from the project head."""
    repo, task = str(body.get("repo") or "").strip(), str(body.get("task") or "").strip()
    if not repo or not task:
        raise HTTPException(400, "Both a repository and a task are required.")
    task_type = body.get("task_type") or "debug"
    if task_type not in pipeline.MODES:
        raise HTTPException(400, "task_type must be debug or feature.")
    if is_url(repo) or body.get("mode") in ("own", "other"):
        need_sign_in()
    kind = choose(body.get("mode"), repo)
    who = scope()
    pid = projects.ensure(who, repo, kind)["project_id"]
    if not projects.acquire(pid):  # held until the run ends; other projects are not affected
        raise HTTPException(409, detail={"message": projects.BUSY, "project_id": pid})
    run_id = uuid.uuid4().hex[:8]
    RUNS[run_id] = {"id": run_id, "project_id": pid, "status": "running", "started_at": projects.now(), "finished_at": None,
                    "steps": [], "result": {"task_type": task_type}}
    token = repo_mod.current_token()

    def work():
        try:
            repo_mod.bind_token(token)  # the run acts as whoever started it, even if they sign out meanwhile
            pipeline.run(repo, task, run_id=run_id, task_type=task_type, kind=kind, scope=who, locked=True,
                         on_step=lambda s: RUNS.__setitem__(run_id, s))
        except Exception as e:  # the pipeline reports its own failures; this is e.g. an unwritable database
            RUNS[run_id] = {**RUNS[run_id], "status": "failed", "result": {"error": f"{type(e).__name__}: {e}"}}
        finally:
            projects.release(pid)

    threading.Thread(target=work, daemon=True).start()
    return {"id": run_id, "project_id": pid}


@app.get("/api/run/{run_id}")
def get_run(run_id: str):
    pid = RUNS[run_id].get("project_id") if run_id in RUNS else projects.run_project(run_id)  # stored: before a restart
    if not pid or projects.get(pid)["user_scope"] != scope():
        raise HTTPException(404, "Unknown run id.")
    return RUNS[run_id] if run_id in RUNS else projects.run_state(pid, run_id)


# ---- projects ------------------------------------------------------------------------------------
def owned(project_id):
    """The project, if it belongs to the current user. Someone else's is 404, never 403: its existence is not ours to tell."""
    p = projects.get(project_id)
    if not p or p["user_scope"] != scope():
        raise HTTPException(404, "Unknown project.")
    return p


def act(project_id, action, failed="That did not work"):
    """Run a project action while holding the project, so it never overlaps a run (409 if one is going)."""
    owned(project_id)
    try:
        with projects.hold(project_id):
            return action()
    except projects.Busy as e:
        raise HTTPException(409, str(e))
    except projects.UserError as e:
        raise HTTPException(400, str(e))
    except (RuntimeError, OSError) as e:  # git or gh said no, or a file is locked
        raise HTTPException(400, f"{failed}: {e}")


@app.get("/api/projects")
def list_projects():
    return projects.list_projects(scope())


@app.get("/api/projects/{project_id}")
def get_project(project_id: str):
    return projects.summary(owned(project_id), detail=True)


@app.get("/api/projects/{project_id}/runs")
def list_runs(project_id: str):
    owned(project_id)
    return projects.runs(project_id)


@app.get("/api/projects/{project_id}/runs/{run_id}")
def get_project_run(project_id: str, run_id: str):
    owned(project_id)
    state = projects.run_state(project_id, run_id)
    if not state:
        raise HTTPException(404, "Unknown run id.")
    return state


@app.get("/api/projects/{project_id}/diff")
def project_diff(project_id: str, since: str = Query("base", alias="from")):
    owned(project_id)
    try:
        return {"diff": projects.diff(project_id, since)}
    except projects.UserError as e:
        raise HTTPException(400, str(e))


@app.post("/api/projects/{project_id}/reset")
def reset_project(project_id: str, body: dict = Body(...)):
    return act(project_id, lambda: projects.reset(project_id, body.get("to")), "Could not reset the project")


@app.post("/api/projects/{project_id}/sync")
def sync_project(project_id: str):
    return act(project_id, lambda: projects.sync(project_id), "Could not sync with upstream")


@app.post("/api/projects/{project_id}/export")
def export_project(project_id: str, body: dict = Body(default={})):
    # The original folder is written to only when the request says confirm: true, exactly.
    return act(project_id, lambda: projects.export(project_id, body.get("confirm") is True), "Could not export")


@app.post("/api/projects/{project_id}/pr")
def project_pull_request(project_id: str):
    """Push the project branch and open (or return) the project's pull request. Only ever called by the user clicking the button."""
    need_sign_in()
    return act(project_id, lambda: {"url": projects.pull_request(project_id)}, "Could not open the pull request")


@app.delete("/api/projects/{project_id}/venv")
def delete_venv(project_id: str):
    return act(project_id, lambda: {"deleted": envmgr.delete(project_id)}, "Could not delete the environment")


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str):
    return act(project_id, lambda: {"deleted": projects.delete(project_id)}, "Could not delete the project")


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
