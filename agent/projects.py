"""Projects: one persistent workspace and run history per repository. Deterministic, no LLM.

<CODEFIX_HOME>/projects/<project_id>/workspace   the git working copy, on branch codefix/<slug>; kept between runs
<CODEFIX_HOME>/projects/<project_id>/venv        the project's own environment (agent/envmgr.py)
<CODEFIX_HOME>/projects/<project_id>/runs/<id>   report.md, state.json and JUnit XML of one run
<CODEFIX_HOME>/data/codefix.sqlite               projects, runs, events: metadata only

The database never holds a token, an API key or file contents: diffs and test output stay in state.json.
"""
import ast
import hashlib
import json
import os
import re
import shutil
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from . import edits
from . import repo as repo_mod
from .repo import git

BUSY = "This project is busy with another run. Wait for it to finish, then try again."
SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    project_id TEXT PRIMARY KEY, user_scope TEXT NOT NULL, project_key TEXT NOT NULL, kind TEXT NOT NULL,
    display_name TEXT, source TEXT, branch TEXT, base_ref TEXT, base_sha TEXT, created_at TEXT,
    head_sha TEXT, ahead INTEGER DEFAULT 0, locked_total INTEGER DEFAULT 0, locked_added INTEGER DEFAULT 0,
    env_state TEXT, env_python TEXT, env_last_used TEXT,
    pr_url TEXT, pushed_sha TEXT, force_next_push INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, mode TEXT, task TEXT, status TEXT,
    head_before TEXT, commit_sha TEXT, started_at TEXT, finished_at TEXT, duration_s REAL,
    env_status TEXT, env_reason TEXT, attempts INTEGER DEFAULT 0, syntax_stage INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY, project_id TEXT NOT NULL, at TEXT, kind TEXT, detail TEXT);
"""


class Busy(Exception):
    """A run or another action already holds this project (HTTP 409)."""


class UserError(Exception):
    """The request cannot be done on this project; the message is shown to the user (HTTP 400)."""


def home():
    return Path(os.getenv("CODEFIX_HOME") or Path(__file__).parent.parent)


def project_dir(project_id):
    return home() / "projects" / project_id


def workspace(project_id):
    return project_dir(project_id) / "workspace"


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---- database ----------------------------------------------------------------------------------
_local = threading.local()


def db():
    """This thread's connection (sqlite connections are not shared between threads)."""
    path = home() / "data" / "codefix.sqlite"
    if getattr(_local, "path", None) != path:
        path.parent.mkdir(parents=True, exist_ok=True)
        con = sqlite3.connect(path, timeout=30)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA journal_mode=WAL")
        con.executescript(SCHEMA)
        _local.con, _local.path = con, path
    return _local.con


def get(project_id):
    row = db().execute("SELECT * FROM projects WHERE project_id=?", (project_id,)).fetchone()
    return dict(row) if row else None


def set_fields(project_id, **fields):
    with db() as con:  # column names come from our own keyword arguments, never from a request
        con.execute(f"UPDATE projects SET {', '.join(k + '=?' for k in fields)} WHERE project_id=?",
                    (*fields.values(), project_id))


def log_event(project_id, kind, detail):
    with db() as con:
        con.execute("INSERT INTO events (project_id, at, kind, detail) VALUES (?,?,?,?)", (project_id, now(), kind, detail))


# ---- identity ----------------------------------------------------------------------------------
def _no_userinfo(url):
    """A URL may carry `user:token@`; that part is never stored or cloned from."""
    return re.sub(r"//[^/@]+@", "//", url)


def project_key(src):
    src = str(src).strip()
    if not repo_mod.is_url(src):
        return "local:" + os.path.normcase(os.path.realpath(src))  # normcase: C:\\Repo and c:\\repo are one project
    url = _no_userinfo(src).rstrip("/").removesuffix(".git").rstrip("/")
    slug = repo_mod.github_slug(url)
    return f"github:{slug[0]}/{slug[1]}".lower() if slug else "git:" + url


def project_id(user_scope, key):
    return hashlib.sha256(f"{user_scope}|{key}".encode()).hexdigest()[:16]


def _names(src, kind):
    """(display name, branch) for a source."""
    slug = repo_mod.github_slug(_no_userinfo(src).rstrip("/")) if repo_mod.is_url(src) else None
    name = slug[1] if slug else Path(src.rstrip("/").removesuffix(".git")).name or "project"
    branch = "codefix/" + (re.sub(r"[^a-z0-9._-]+", "-", name.lower()).strip("-.") or "project")
    return ("/".join(slug) if slug and kind == "others" else name), branch


def ensure(user_scope, src, kind=None):
    """The project row for (user, repository), created on first sight. Makes nothing on disk yet."""
    src = str(src).strip()
    pid = project_id(user_scope, project_key(src))
    row = get(pid)
    if not row:
        url = repo_mod.is_url(src)
        # `source` can be given back as the repo of a later run and lands on this same project.
        source = _no_userinfo(src) if url else str(Path(src).resolve())
        slug = repo_mod.github_slug(source.rstrip("/")) if url else None
        if slug:  # the form /api/repos lists: no .git, no trailing slash
            source = f"https://github.com/{slug[0]}/{slug[1]}"
        guess = kind or ("mine" if url else "local")  # corrected by the run's access step
        name, branch = _names(source, guess)
        with db() as con:
            con.execute("INSERT OR IGNORE INTO projects (project_id, user_scope, project_key, kind, display_name, source,"
                        " branch, created_at) VALUES (?,?,?,?,?,?,?,?)",
                        (pid, user_scope, project_key(src), guess, name, source, branch, now()))
    elif kind and kind != row["kind"]:
        set_kind(pid, kind)
    return get(pid)


def set_kind(project_id, kind):
    set_fields(project_id, kind=kind, display_name=_names(get(project_id)["source"], kind)[0])


# ---- one run (or action) at a time per project --------------------------------------------------
# ponytail: in-process lock, so cli.py and a running server do not see each other's runs;
# a lock file in the project folder is the upgrade if both are used on one project at once.
_busy, _busy_lock = set(), threading.Lock()


def acquire(project_id):
    with _busy_lock:
        if project_id in _busy:
            return False
        _busy.add(project_id)
        return True


def release(project_id):
    with _busy_lock:
        _busy.discard(project_id)


def is_busy(project_id):
    return project_id in _busy


@contextmanager
def hold(project_id):
    if not acquire(project_id):
        raise Busy(BUSY)
    try:
        yield
    finally:
        release(project_id)


# ---- workspace ---------------------------------------------------------------------------------
def _clean(ws, branch):
    """Put a workspace back to its committed head. Returns the leftover changes that were thrown away."""
    git(["rebase", "--abort"], cwd=ws, check=False)  # a crash in the middle of a sync
    dirty = git(["status", "--porcelain"], cwd=ws).splitlines()
    if dirty:
        git(["reset", "-q", "--hard", "HEAD"], cwd=ws)
        git(["clean", "-fdq"], cwd=ws)
        git(["stash", "clear"], cwd=ws)  # a crash in the middle of a reproduce step
    if git(["branch", "--show-current"], cwd=ws).strip() != branch:
        git(["checkout", "-q", branch], cwd=ws)  # commits only ever land on the project branch
    return dirty


def open_workspace(project_id):
    """Create the workspace on the first run, otherwise make sure it is clean. Returns the prepare step's detail."""
    p, ws = get(project_id), workspace(project_id)
    if not p["base_sha"]:
        if ws.exists():  # an earlier first run died half-way through the clone
            repo_mod._rmtree(ws)
        ws.parent.mkdir(parents=True, exist_ok=True)
        base_ref, base_sha = repo_mod.prepare(p["source"], ws, p["branch"])
        set_fields(project_id, base_ref=base_ref, base_sha=base_sha)
        refresh(project_id)
        return f"workspace clean (new project on branch {p['branch']})"
    dirty = _clean(ws, p["branch"])
    if not dirty:
        return "workspace clean"
    names = ", ".join(line[3:] for line in dirty[:3]) + (", ..." if len(dirty) > 3 else "")
    return f"cleaned {len(dirty)} leftover change(s) from an interrupted run, reset to head: {names}"


def head(ws):
    return git(["rev-parse", "HEAD"], cwd=ws).strip()


def commit_run(ws, head_before, message):
    """Squash everything a successful run did since head_before into ONE commit. Returns (sha, diff, files)."""
    git(["add", "-A"], cwd=ws)
    git(["reset", "-q", "--soft", head_before], cwd=ws)  # the syntax stage may have committed on its own
    git(["commit", "-q", "-m", message], cwd=ws)
    sha = head(ws)
    return sha, git(["diff", head_before, sha], cwd=ws), git(["diff", "--name-only", head_before, sha], cwd=ws).split()


def rollback(ws, head_before):
    """A run that did not succeed leaves the head and the files exactly as they were."""
    git(["reset", "-q", "--hard", head_before], cwd=ws)
    git(["clean", "-fdq"], cwd=ws)


def _count_tests(ws, only=None):
    """Test functions in locked test files, counted with ast (nothing is executed)."""
    total = 0
    for path in repo_mod.py_files(ws):
        rel = path.relative_to(ws).as_posix()
        if not edits.is_test_file(rel) or (only is not None and rel not in only):
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"))
        except SyntaxError:
            continue
        total += sum(isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name.startswith("test")
                     for n in ast.walk(tree))
    return total


def refresh(project_id):
    """Recompute what the project list shows. Called whenever the head moves, so listing needs no git."""
    p, ws = get(project_id), workspace(project_id)
    base = p["base_sha"]
    added = set(git(["diff", "--name-only", "--diff-filter=A", base, "HEAD"], cwd=ws).split())
    set_fields(project_id, head_sha=head(ws), ahead=int(git(["rev-list", "--count", f"{base}..HEAD"], cwd=ws)),
               locked_total=_count_tests(ws), locked_added=_count_tests(ws, added))


# ---- runs --------------------------------------------------------------------------------------
def start_run(state, task):
    with db() as con:
        con.execute("INSERT INTO runs (run_id, project_id, mode, task, status, started_at) VALUES (?,?,?,?,?,?)",
                    (state["id"], state["project_id"], state["result"]["task_type"], task, state["status"], state["started_at"]))


def save_run(state):
    """Called on every step change: the row holds the list fields, state.json holds everything."""
    r = state["result"]
    with db() as con:
        con.execute("UPDATE runs SET status=?, head_before=?, commit_sha=?, finished_at=?, duration_s=?, env_status=?,"
                    " env_reason=?, attempts=?, syntax_stage=? WHERE run_id=?",
                    (state["status"], r["head_before"], r["commit_sha"], state["finished_at"], state["duration_s"],
                     r["env_status"], r["env_reason"], r["attempts"],
                     int(bool(r.get("syntax")) or any(s["name"] == "syntax" for s in state["steps"])), state["id"]))
    folder = project_dir(state["project_id"]) / "runs" / state["id"]
    if folder.is_dir():
        (folder / "state.json").write_text(json.dumps(state), encoding="utf-8")


def _run_row(row):
    run = dict(row)
    # A run still marked running that nothing here is running was cut off by a crash or a restart.
    if run["status"] == "running" and not is_busy(run["project_id"]):
        run["status"] = "failed"
    run["syntax_stage"] = bool(run["syntax_stage"])
    del run["project_id"]
    return run


def runs(project_id):
    """Run list items, newest first."""
    rows = db().execute("SELECT * FROM runs WHERE project_id=? ORDER BY started_at DESC, rowid DESC", (project_id,))
    return [_run_row(r) for r in rows]


def run_project(run_id):
    """The project a run belongs to, or None."""
    row = db().execute("SELECT project_id FROM runs WHERE run_id=?", (run_id,)).fetchone()
    return row["project_id"] if row else None


def run_state(project_id, run_id):
    """The stored state of one run (the GET /api/run/{id} shape) plus step_timings, or None."""
    row = db().execute("SELECT * FROM runs WHERE run_id=? AND project_id=?", (run_id, project_id)).fetchone()
    if not row:
        return None
    run = _run_row(row)
    try:
        state = json.loads((project_dir(project_id) / "runs" / run_id / "state.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):  # the folder was removed by hand: the row is all that is left
        state = {"id": run_id, "project_id": project_id, "steps": [], "result": {}}
    if run["status"] != row["status"]:  # _run_row found it cut off
        state["result"]["error"] = "The run was interrupted (the server stopped) before it finished."
    state["status"] = run["status"]
    state["step_timings"] = [{"step": s["name"], "duration_s": s.get("duration_s")} for s in state["steps"]]
    return state


# ---- what the API returns ----------------------------------------------------------------------
def summary(p, detail=False):
    pid = p["project_id"]
    last = db().execute("SELECT * FROM runs WHERE project_id=?"
                        " ORDER BY started_at DESC, rowid DESC LIMIT 1", (pid,)).fetchone()
    ready = (project_dir(pid) / "venv" / ".ready").is_file()
    out = {
        "project_id": pid, "kind": p["kind"], "display_name": p["display_name"], "source": p["source"],
        "branch": p["branch"], "head_sha": p["head_sha"] or "", "changes_ahead_of_base": p["ahead"] or 0,
        "run_count": db().execute("SELECT COUNT(*) FROM runs WHERE project_id=?", (pid,)).fetchone()[0],
        "last_run": {k: v for k, v in _run_row(last).items() if k in ("run_id", "status", "mode", "finished_at")} if last else None,
        "env": {"ready": ready, "state": "ready" if ready else "evicted" if p["env_state"] == "evicted" else "missing",
                "python": p["env_python"] if ready else None, "last_used": p["env_last_used"]},
        "locked_tests": {"total": p["locked_total"] or 0, "added_by_runs": p["locked_added"] or 0},
        "busy": is_busy(pid)}
    if detail:
        ws = workspace(pid)
        tags = git(["tag", "--list", "codefix/archive/*"], cwd=ws).split() if p["base_sha"] and ws.is_dir() else []
        events = db().execute("SELECT at, kind, detail FROM events WHERE project_id=? ORDER BY id DESC", (pid,))
        out.update(base_ref=p["base_ref"] or "", base_sha=p["base_sha"] or "", archive_tags=tags,
                   base_label=(f"snapshot of {Path(p['source']).name}" if p["kind"] == "local"
                               else f"origin/{p['base_ref'] or ''}"),
                   pr_url=p["pr_url"] or "", events=[dict(e) for e in events])
    return out


def list_projects(user_scope):
    rows = db().execute("SELECT * FROM projects WHERE user_scope=? ORDER BY created_at DESC, rowid DESC", (user_scope,))
    return [summary(dict(r)) for r in rows]


# ---- project actions (the caller holds the project with hold()) ---------------------------------
def _ready(project_id):
    p = get(project_id)
    if not p["base_sha"]:
        raise UserError("This project has no workspace yet. Run a task on it first.")
    return p, workspace(project_id)


def _target(project_id, to, p):
    """The commit that "base" or a run id stands for."""
    if to in (None, "", "base"):
        return p["base_sha"]
    row = db().execute("SELECT commit_sha, head_before FROM runs WHERE run_id=? AND project_id=?", (str(to), project_id)).fetchone()
    if not row or not (row["commit_sha"] or row["head_before"]):
        raise UserError(f"Unknown run: {to}")
    return row["commit_sha"] or row["head_before"]


def diff(project_id, since="base"):
    """Cumulative diff from base, or from the state a run left behind, up to the head."""
    p = get(project_id)
    if not p["base_sha"]:
        return ""
    return git(["diff", _target(project_id, since, p), "HEAD"], cwd=workspace(project_id))


def _archive(ws, sha):
    """Tag `sha` so a reset or rebase never makes a commit unreachable. Returns the tag name."""
    name = stamp = "codefix/archive/" + datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    n = 1
    while git(["tag", "--list", name], cwd=ws).strip():  # two resets within one second
        n += 1
        name = f"{stamp}-{n}"
    git(["tag", name, sha], cwd=ws)
    return name


def reset(project_id, to):
    """Move the project head to base or to a successful run's commit, after tagging the current head."""
    p, ws = _ready(project_id)
    if to != "base" and not db().execute("SELECT 1 FROM runs WHERE run_id=? AND project_id=? AND status='success'",
                                         (str(to), project_id)).fetchone():
        raise UserError("Reset goes to base or to a successful run of this project.")
    target = _target(project_id, to, p)
    _clean(ws, p["branch"])
    tag = _archive(ws, head(ws))
    git(["reset", "-q", "--hard", target], cwd=ws)
    git(["clean", "-fdq"], cwd=ws)
    refresh(project_id)
    log_event(project_id, "reset", f"reset to {to} ({target[:7]}); previous head kept as {tag}")
    return {"head_sha": head(ws), "archive_tag": tag}


def sync(project_id):
    """Rebase the project branch onto the latest default branch. A conflict changes nothing and is reported."""
    p = get(project_id)
    if p["kind"] == "local":
        return {"status": "not_applicable"}
    p, ws = _ready(project_id)
    _clean(ws, p["branch"])
    git(["fetch", "-q", "origin"], cwd=ws)
    upstream, old = f"origin/{p['base_ref']}", head(ws)
    git(["rebase", "-q", upstream], cwd=ws, check=False)
    if any((ws / ".git" / d).exists() for d in ("rebase-merge", "rebase-apply")):
        conflicts = git(["diff", "--name-only", "--diff-filter=U"], cwd=ws).split()
        git(["rebase", "--abort"], cwd=ws)  # never resolved automatically
        return {"status": "conflict", "conflicts": conflicts}
    if int(git(["rev-list", "--count", f"HEAD..{upstream}"], cwd=ws)):
        raise RuntimeError(f"could not rebase {p['branch']} onto {upstream}")
    new_base, new = git(["rev-parse", upstream], cwd=ws).strip(), head(ws)
    if new != old:
        olds = git(["rev-list", "--reverse", f"{p['base_sha']}..{old}"], cwd=ws).split()
        news = git(["rev-list", "--reverse", f"{new_base}..{new}"], cwd=ws).split()
        if olds:  # commits were rewritten: keep the old ones reachable, and force the next push (with lease)
            _archive(ws, old)
            if p["pushed_sha"]:
                set_fields(project_id, force_next_push=1)
        if len(olds) == len(news):  # runs keep pointing at their commit, so reset-to-run and diff still work
            with db() as con:
                for a, b in zip([p["base_sha"], *olds], [new_base, *news]):
                    con.execute("UPDATE runs SET commit_sha=? WHERE commit_sha=? AND project_id=?", (b, a, project_id))
                    con.execute("UPDATE runs SET head_before=? WHERE head_before=? AND project_id=?", (b, a, project_id))
        log_event(project_id, "sync", f"rebased onto {upstream} ({new_base[:7]})")
    set_fields(project_id, base_sha=new_base)
    refresh(project_id)
    return {"status": "ok"}


def export(project_id, confirm=False):
    """Local projects: write base..head as a patch file, or (confirm) copy the changed files into the original folder."""
    p, ws = _ready(project_id)
    if p["kind"] != "local":
        raise UserError("Export is for local folder projects. Use the pull request for a GitHub project.")
    if not confirm:
        out = project_dir(project_id) / "exports"
        out.mkdir(exist_ok=True)
        path = out / f"{p['display_name']}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.patch"
        path.write_text(git(["diff", p["base_sha"], "HEAD"], cwd=ws), encoding="utf-8", newline="\n")
        return {"patch_path": str(path)}
    dest = Path(p["source"])
    if not dest.is_dir():
        raise UserError(f"The original folder no longer exists: {dest}")
    # ponytail: copies over whatever is there now; a 3-way merge is the upgrade if the folder was edited meanwhile
    changed = git(["diff", "--name-status", "--no-renames", "-z", p["base_sha"], "HEAD"], cwd=ws).split("\0")
    for status, rel in zip(changed[::2], changed[1::2]):
        if status == "D":
            (dest / rel).unlink(missing_ok=True)
        else:
            (dest / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ws / rel, dest / rel)
    log_event(project_id, "export", f"wrote {len(changed) // 2} file(s) to {dest}")
    return {"written_to": str(dest)}


def pull_request(project_id):
    """Push the project branch and open the project's ONE pull request (or return the one already open)."""
    p, ws = _ready(project_id)
    if p["kind"] == "local":
        raise UserError("A local folder project has no GitHub repository. Use Export instead.")
    if not p["ahead"]:
        raise UserError("This project has no changes yet, so there is nothing to open a pull request from.")
    if p["pr_url"] and p["pushed_sha"] == p["head_sha"]:
        return p["pr_url"]  # a second click: nothing new to push
    pr = repo_mod.publish(p["source"], ws, p["branch"], p["kind"], p["pushed_sha"] if p["force_next_push"] else None)
    set_fields(project_id, pushed_sha=p["head_sha"], force_next_push=0)
    if not pr["repo"]:
        raise UserError(f"Pushed branch `{p['branch']}` to origin. Pull requests can only be opened for GitHub repositories.")
    tasks = [r["task"] for r in runs(project_id) if r["status"] == "success"]
    body = ("Changes made by CodeFix runs, each verified against the test suite:\n\n"
            + "\n".join(f"- {t.strip().splitlines()[0][:200]}" for t in tasks if t.strip())
            + "\n\n_These changes were written and tested by an AI software engineering agent (CodeFix) and "
              "submitted by the account owner. Please review before merging._")
    title = f"codefix: {tasks[0].strip().splitlines()[0][:60]}" if tasks and tasks[0].strip() else f"codefix: {p['display_name']}"
    url = repo_mod.open_pr(pr, title, body)  # gh answers "already exists" with the open PR's URL
    set_fields(project_id, pr_url=url)
    return url


def delete(project_id):
    """Remove the workspace, the venv, the run files and the history."""
    if project_dir(project_id).exists():
        repo_mod._rmtree(project_dir(project_id))
    with db() as con:
        for table in ("events", "runs", "projects"):
            con.execute(f"DELETE FROM {table} WHERE project_id=?", (project_id,))
    return True
