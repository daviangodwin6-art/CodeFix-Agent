"""Git working copy and repo map. Deterministic, no LLM."""
import ast
import json
import os
import re
import stat
import shutil
import threading
import time
from pathlib import Path

from . import sandbox

SKIP_DIRS = {".git", ".venv", "venv", "env", "node_modules", "__pycache__", ".pytest_cache", ".tox", "build", "dist"}
# Never let test-run leftovers into the diff, whatever the target's .gitignore says.
EXCLUDES = "__pycache__/\n.pytest_cache/\n*.pyc\n*.egg-info/\n"


# The signed-in user's GitHub token (from the page's "Sign in with GitHub"). Memory only: never written
# to disk, a URL, a git remote, a report or an error message. Empty = use the gh CLI login of this PC.
# ponytail: one signed-in user per server process (local 127.0.0.1 tool); per-browser cookie sessions
# are the upgrade if several people ever share one server.
_token = ""
_bound = threading.local()  # a run keeps the token it started with, even if the user signs out meanwhile


def set_token(token):
    global _token
    _token = token or ""


def current_token():
    return getattr(_bound, "token", None) if getattr(_bound, "token", None) is not None else _token


def bind_token(token):
    """Pin this thread (a pipeline run) to one token."""
    _bound.token = token or ""


def _scrub(text, token):
    return text.replace(token, "***") if token else text


def git(args, cwd, check=True):
    token = current_token()
    p = sandbox.run_trusted_git(args, cwd, token)
    if check and p.returncode != 0:
        raise RuntimeError(_scrub(f"git {' '.join(args)} failed:\n{p.stdout}{p.stderr}", token))
    return p.stdout


def is_url(src):
    return src.startswith(("http://", "https://", "git@", "file://")) or src.endswith(".git")


def default_branch(clone):
    base = git(["rev-parse", "--abbrev-ref", "origin/HEAD"], cwd=clone, check=False).strip()
    return base.removeprefix("origin/") if base and base != "origin/HEAD" else "main"


def prepare(src, dest, branch):
    """Create a project workspace at dest: clone src (URL) or snapshot it (folder), then start `branch`.

    The original is never touched. Returns (base_ref, base_sha): where the project started from.
    """
    dest = Path(dest)
    if is_url(src):
        # Full clone, not --depth 1: the workspace is kept, and sync later rebases onto new upstream commits.
        git(["clone", "-q", src, str(dest)], cwd=dest.parent)
        token = current_token()
        # Repo code runs inside this working copy and can read .git/config: the token must not be there.
        if token and token in (dest / ".git" / "config").read_text(encoding="utf-8", errors="replace"):
            raise RuntimeError("the clone stored the GitHub token in .git/config; refusing to run repo code")
        base_ref = default_branch(dest)
    else:
        if not Path(src).is_dir():
            raise RuntimeError(f"repo not found: {src}")
        # ponytail: local repos are snapshotted (history dropped); clone them if history ever matters
        shutil.copytree(src, dest, ignore=shutil.ignore_patterns(*SKIP_DIRS))
        git(["init", "-q"], cwd=dest)
        git(["add", "-A"], cwd=dest)
        git(["commit", "-q", "--allow-empty", "-m", f"snapshot of {src}"], cwd=dest)
        base_ref = git(["branch", "--show-current"], cwd=dest).strip()
    (dest / ".git" / "info").mkdir(exist_ok=True)
    (dest / ".git" / "info" / "exclude").write_text(EXCLUDES, encoding="utf-8")
    git(["checkout", "-q", "-b", branch], cwd=dest)
    return base_ref, git(["rev-parse", "HEAD"], cwd=dest).strip()


def revert(repo):
    git(["checkout", "-q", "--", "."], cwd=repo)
    git(["clean", "-fdq"], cwd=repo)


def stash(repo, paths):
    """Temporarily put these tracked files back to their committed content (untracked files stay)."""
    git(["stash", "push", "-q", "--", *paths], cwd=repo)


def unstash(repo):
    git(["stash", "pop", "-q"], cwd=repo)


def commit(repo, message):
    """Commit everything on the branch; return (diff, files_changed)."""
    git(["add", "-A"], cwd=repo)
    diff = git(["diff", "--cached"], cwd=repo)
    files = git(["diff", "--cached", "--name-only"], cwd=repo).split()
    git(["commit", "-q", "-m", message], cwd=repo)
    return diff, files


def gh(args, check=True, token=None):
    """Run the GitHub CLI as the signed-in user (or `token`). Raises RuntimeError if gh is missing or (check) fails."""
    token = current_token() if token is None else token
    try:
        p = sandbox.run_trusted_gh(args, token)
    except FileNotFoundError:
        raise RuntimeError("GitHub CLI (gh) is not installed")
    if check and p.returncode != 0:
        raise RuntimeError(_scrub(f"gh {' '.join(args[:3])} failed: {(p.stderr or p.stdout).strip()[-300:]}", token))
    return p


def github_slug(src):
    """(owner, repo) for an https github.com URL, else None."""
    m = re.match(r"https://github\.com/([^/\s]+)/([^/\s]+?)(?:\.git)?/?$", src)
    return m.groups() if m else None


def access(src):
    """own: local folder | write / none: GitHub write access | missing: no such repo (or private) | nogh: GitHub but gh unusable | other: any other URL."""
    if not is_url(src):
        return "own"
    slug = github_slug(src)
    if not slug:
        return "other"
    for attempt in range(3):  # a single network blip must not be read as "no gh"
        try:
            p = gh(["api", f"repos/{slug[0]}/{slug[1]}", "--jq", ".permissions.push"], check=False)
        except RuntimeError:
            return "nogh"  # gh is not installed
        if p.returncode == 0:
            return "write" if p.stdout.strip() == "true" else "none"
        if "404" in p.stderr or "Not Found" in p.stderr:
            return "missing"  # does not exist, or private and not ours
        time.sleep(2)
    return "nogh"  # not logged in, or GitHub unreachable


def _why(e):
    """The lines of a git error that say why (remote:/fatal:/error:), not the long URLs around them."""
    lines = [l.strip() for l in str(e).splitlines() if l.strip().startswith(("remote:", "fatal:", "error:"))]
    return " | ".join(lines)[:400] or str(e)[-300:]


def whoami(token=None):
    """GitHub login of the signed-in user (or of `token`), or "" if there is none or it is not valid."""
    try:
        return gh(["api", "user", "--jq", ".login"], token=token).stdout.strip()
    except RuntimeError:
        return ""


def my_repos():
    """The signed-in user's repositories: [{"name": "owner/repo", "url", "private"}]."""
    out = gh(["repo", "list", "--limit", "100", "--json", "nameWithOwner,url,isPrivate"]).stdout
    return [{"name": r["nameWithOwner"], "url": r["url"], "private": r["isPrivate"]} for r in json.loads(out)]


def open_pr(pr, title, body):
    """Open the pull request described by publish()'s result. Returns its URL (the existing one if already open)."""
    p = gh(["pr", "create", "--repo", pr["repo"], "--head", pr["head"], "--base", pr["base"],
            "--title", title, "--body", body], check=False)
    found = re.search(r"https://github\.com/\S+/pull/\d+", p.stdout + p.stderr)
    if found:  # created, or gh reports "already exists" with the URL
        return found.group(0)
    raise RuntimeError((p.stderr or p.stdout).strip()[-300:] or "gh pr create failed")


def _rmtree(path):
    def retry(func, p, _exc):  # Windows: git object files are read-only
        os.chmod(p, stat.S_IWRITE)
        func(p)
    shutil.rmtree(path, onexc=retry)


def publish(src, clone, branch, kind, lease=None):
    """Push the project branch and return what open_pr() needs: {"repo", "head", "base"} ("repo" is None off GitHub).

    kind "mine": pushed to origin. kind "others": no write access, so the repo is forked to the user's
    account (gh) and the branch is pushed there.
    lease: the commit the remote branch is expected to hold. Given only when a sync rebased commits that
    were already pushed; that one push uses --force-with-lease. Every other push is a plain one, never forced.
    """
    slug = github_slug(src)
    force = [f"--force-with-lease={branch}:{lease}"] if lease else []
    out = {"repo": "/".join(slug) if slug else None, "head": branch, "base": default_branch(clone)}
    try:
        if kind != "others":
            git(["push", *force, "origin", branch], cwd=clone)
            return out
        # POST .../forks is idempotent and returns the fork's real name (GitHub renames on a clash).
        full = gh(["api", "-X", "POST", f"repos/{slug[0]}/{slug[1]}/forks", "--jq", ".full_name"]).stdout.strip()
        for attempt in range(4):  # a brand-new fork takes a few seconds to become pushable
            try:
                git(["push", *force, f"https://github.com/{full}.git", branch], cwd=clone)
                break
            except RuntimeError:
                if attempt == 3:
                    raise
                time.sleep(5)
    except RuntimeError as e:
        raise RuntimeError(f"push failed: {_why(e)}")
    return {**out, "head": f"{full.split('/')[0]}:{branch}"}


def py_files(repo):
    repo = Path(repo)
    for p in sorted(repo.rglob("*.py")):
        if not SKIP_DIRS & set(p.relative_to(repo).parts):
            yield p


def repo_map(repo, cap=12000):
    """One line per Python file: path and its top-level functions/classes (with methods)."""
    lines = []
    for p in py_files(repo):
        try:
            tree = ast.parse(p.read_text(encoding="utf-8", errors="replace"))
        except SyntaxError as e:
            # A file that does not parse is often the very bug to fix; show it, don't hide it.
            lines.append(f"{p.relative_to(repo).as_posix()}: SYNTAX ERROR line {e.lineno}: {e.msg}")
            continue
        names = []
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                names.append(f"{node.name}()")
            elif isinstance(node, ast.ClassDef):
                methods = [n.name for n in node.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
                names.append(f"class {node.name}({', '.join(methods)})")
        lines.append(f"{p.relative_to(repo).as_posix()}: {', '.join(names)}")
    # ponytail: hard character cap; rank files by relevance to the task if big repos get cut off
    return "\n".join(lines)[:cap]
