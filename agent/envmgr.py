"""One Python environment per project, kept between runs. Never shared between projects.

The venv lives at projects/<project_id>/venv and is built in place (a venv cannot be moved: its
interpreter paths are absolute). What makes that safe is the .ready marker: it is written last, so a
venv without it (a build that crashed or was killed) is deleted and rebuilt, never used.
"""
import hashlib
import json
import os
import platform
import sys
from pathlib import Path

from . import projects, runner
from . import repo as repo_mod

READY = ".ready"
DEP_FILES = ("pyproject.toml", "setup.cfg", "setup.py")


def venv_dir(project_id):
    return projects.project_dir(project_id) / "venv"


def dep_hash(workspace):
    """Changes whenever the interpreter, the platform or any dependency file changes."""
    workspace = Path(workspace)
    h = hashlib.sha256(f"{sys.version}|{platform.platform()}".encode())
    for path in sorted(workspace.glob("requirements*.txt")) + [workspace / name for name in DEP_FILES]:
        if path.is_file():
            h.update(path.name.encode() + b"\0" + path.read_bytes() + b"\0")
    return h.hexdigest()


def _marker(venv):
    try:
        return json.loads((venv / READY).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def ensure(project_id, workspace):
    """Reuse the project's venv, or (re)build it when it is missing, unfinished or its dependencies changed.

    Returns {"python", "extra_env", "status": "reused"|"rebuilt", "reason": str|None, "warning"}.
    """
    workspace, venv = Path(workspace), venv_dir(project_id)
    want, marker, project = dep_hash(workspace), _marker(venv), projects.get(project_id)
    if marker and marker.get("dep_hash") == want:
        status, reason = "reused", None
    else:
        status = "rebuilt"
        reason = ("deps changed" if marker else "not ready" if venv.exists()
                  else "evicted" if project["env_state"] == "evicted"
                  else "not ready" if project["env_last_used"] else "first run")
        if venv.exists():
            repo_mod._rmtree(venv)
        _, warning = runner.setup_env(workspace, venv)
        installable = any((workspace / name).exists() for name in ("pyproject.toml", "setup.py"))
        marker = {"dep_hash": want, "editable": installable and not warning, "warning": warning}
        (venv / READY).write_text(json.dumps(marker), encoding="utf-8")  # last: only now is the venv usable
    projects.set_fields(project_id, env_state="ready", env_last_used=projects.now(),
                        env_python=f"{sys.version_info.major}.{sys.version_info.minor}")
    evict()
    # Not installed into its venv: let pytest find the code through PYTHONPATH instead.
    roots = [workspace] + ([workspace / "src"] if (workspace / "src").is_dir() else [])
    extra_env = {} if marker.get("editable") else {"PYTHONPATH": os.pathsep.join(map(str, roots))}
    return {"python": runner.venv_python(venv), "extra_env": extra_env, "status": status, "reason": reason,
            "warning": marker.get("warning", "")}


def evict():
    """Keep at most MAX_CACHED_VENVS venvs: delete the least recently used ones that belong to IDLE projects.

    Only the venv goes; the workspace and history stay, and the venv is rebuilt on the project's next run.
    """
    rows = projects.db().execute("SELECT project_id FROM projects WHERE env_state='ready' ORDER BY env_last_used, rowid").fetchall()
    extra = len(rows) - int(os.getenv("MAX_CACHED_VENVS", "10"))
    for row in rows:
        if extra <= 0:
            break
        if not projects.acquire(row["project_id"]):  # busy (a run is using it): never touched
            continue
        try:
            delete(row["project_id"], state="evicted")
        finally:
            projects.release(row["project_id"])
        extra -= 1


def delete(project_id, state="missing"):
    """Remove the project's venv (the caller holds the project). Returns whether there was one."""
    venv = venv_dir(project_id)
    existed = venv.exists()
    if existed:
        repo_mod._rmtree(venv)
    projects.set_fields(project_id, env_state=state)
    return existed
