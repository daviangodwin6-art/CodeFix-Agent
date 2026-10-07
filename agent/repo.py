"""Git working copy and repo map. Deterministic, no LLM."""
import ast
import json
import os
import re
import stat
import shutil
import subprocess
import threading
import time
from pathlib import Path

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
    cmd = ["git", "-c", "core.autocrlf=false", "-c", "user.name=agent", "-c", "user.email=agent@localhost"]
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    if token:  # authenticate as the signed-in user: gh hands GH_TOKEN to git, nothing is stored
        cmd += ["-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential"]
        env["GH_TOKEN"] = token
    p = subprocess.run(cmd + list(args), cwd=cwd, capture_output=True, encoding="utf-8", errors="replace",
                       timeout=300, env=env)
    if check and p.returncode != 0:
        raise RuntimeError(_scrub(f"git {' '.join(args)} failed:\n{p.stdout}{p.stderr}", token))
    return p.stdout


def is_url(src):
    return src.startswith(("http://", "https://", "git@", "file://")) or src.endswith(".git")


def prepare(src, run_dir, run_id):
    """Copy or clone src to run_dir/repo on a new branch. The original is never touched."""
    dest = Path(run_dir) / "repo"
    if is_url(src):
        git(["clone", "--depth", "1", src, str(dest)], cwd=run_dir)
    else:
        if not Path(src).is_dir():
            raise RuntimeError(f"repo not found: {src}")
        # ponytail: local repos are snapshotted (history dropped); clone them if history ever matters
        shutil.copytree(src, dest, ignore=shutil.ignore_patterns(*SKIP_DIRS))
        git(["init", "-q"], cwd=dest)
        git(["add", "-A"], cwd=dest)
        git(["commit", "-q", "--allow-empty", "-m", "baseline snapshot"], cwd=dest)
    (dest / ".git" / "info").mkdir(exist_ok=True)
    (dest / ".git" / "info" / "exclude").write_text(EXCLUDES, encoding="utf-8")
    branch = f"agent/{run_id}"
    git(["checkout", "-q", "-b", branch], cwd=dest)
    return dest, branch


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


PUBLISH_BRANCH = "agent-changes"
OUTPUT_MARKER = ".agent-output"


def gh(args, check=True, token=None):
    """Run the GitHub CLI as the signed-in user (or `token`). Raises RuntimeError if gh is missing or (check) fails."""
    token = current_token() if token is None else token
    env = {**os.environ, "GH_PROMPT_DISABLED": "1", **({"GH_TOKEN": token} if token else {})}
    try:
        p = subprocess.run(["gh", *args], capture_output=True, encoding="utf-8", errors="replace", timeout=120, env=env)
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


def _commit_on_branch(root, clone, files, message, work, new_from=None):
    """Copy the changed files onto branch `agent-changes` in repo `root` via a temporary worktree."""
    args = ["-b", PUBLISH_BRANCH, new_from] if new_from else [PUBLISH_BRANCH]
    git(["worktree", "add", "-q", str(work), *args], cwd=root)
    try:
        for rel in files:
            (work / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(Path(clone) / rel, work / rel)
        git(["add", "-A"], cwd=work)
        if git(["status", "--porcelain"], cwd=work).strip():  # a repeat of an identical change adds nothing
            git(["commit", "-q", "-m", message], cwd=work)
    finally:
        git(["worktree", "remove", "--force", str(work)], cwd=root, check=False)


def _stack_and_push(clone, remote, files, message, work):
    """Build `agent-changes` on top of the remote's existing one (if any) and push it. Never forced."""
    # ponytail: shallow fetch of the existing branch; later runs stack on it instead of diverging
    git(["fetch", "--depth=1", remote, f"+{PUBLISH_BRANCH}:refs/heads/{PUBLISH_BRANCH}"], cwd=clone, check=False)
    if git(["rev-parse", "--verify", "-q", PUBLISH_BRANCH], cwd=clone, check=False).strip():
        _commit_on_branch(clone, clone, files, message, work)
    else:
        git(["branch", "-f", PUBLISH_BRANCH, "HEAD"], cwd=clone)
    git(["push", remote, PUBLISH_BRANCH], cwd=clone)


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
    """Open the pull request described by publish()'s "pr". Returns its URL (the existing one if already open)."""
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


def export_local(clone, name, task, result):
    """Copy the finished project (git repo on branch agent-changes) to AGENT_OUTPUT_DIR/<name>. Returns the path."""
    base = Path(os.getenv("AGENT_OUTPUT_DIR", r"D:\Hacknex\agent_output"))
    base.mkdir(parents=True, exist_ok=True)
    dest, n = base / name, 1
    while dest.exists():
        if (dest / OUTPUT_MARKER).exists():  # our own earlier export: replace it
            _rmtree(dest)
            break
        n += 1  # a folder we did not create is never touched
        dest = base / f"{name}-{n}"
    shutil.copytree(clone, dest)
    git(["checkout", "-q", PUBLISH_BRANCH], cwd=dest)
    (dest / OUTPUT_MARKER).write_text("created by the agent; safe to replace on the next run\n", encoding="utf-8")
    b, a = result["baseline"], result["after"]
    (dest / "CHANGES.md").write_text(
        f"# {task}\n\n{result['explanation']}\n\n"
        f"Tests before: {b['passed']} passed / {b['total']} total. After: {a['passed']} passed / {a['total']} total. "
        f"Regressions: {len(result['regressions'])}.\n\nBranch: `{PUBLISH_BRANCH}`\n\n```diff\n{result['diff']}```\n",
        encoding="utf-8")
    with open(dest / ".git" / "info" / "exclude", "a", encoding="utf-8") as f:
        f.write(f"{OUTPUT_MARKER}\nCHANGES.md\n")
    return str(dest)


def publish(src, clone, files, task, run_dir, choice, result):
    """Put the committed change on branch `agent-changes`. Returns {"note", "pr_url", "output_path", "pr"}; "pr" is what open_pr() needs, or None.

    choice "own": local git repo; branch created or extended in the user's own repo through a temporary
        worktree, so their checked-out files are never touched.
    choice "origin": git URL with write access; branch pushed to origin (only that branch, never forced).
    choice "fork": no write access; fork to the user's account (gh), push the branch there, give a PR link.
    choice "local": no GitHub write at all. URL runs are always also exported to AGENT_OUTPUT_DIR/<repo-name>.
    """
    message = f"agent: {task[:60]}"
    work = Path(run_dir) / "publish"
    out = {"note": "", "pr_url": "", "output_path": "", "pr": None}
    if choice == "own":
        src = Path(src).resolve()
        top = git(["rev-parse", "--show-toplevel"], cwd=src, check=False).strip()
        if not top or Path(top).resolve() != src:
            out["note"] = (f"{src} is not the root of a git repository, so no `{PUBLISH_BRANCH}` branch was "
                           f"created. The change is committed in {clone}")
            return out
        # ponytail: copies the changed files over the branch tip (no 3-way merge); fine because the agent
        # only adds/edits files. Revisit if runs on a branch with divergent edits to the same file matter.
        exists = git(["rev-parse", "--verify", "-q", PUBLISH_BRANCH], cwd=src, check=False).strip()
        _commit_on_branch(src, clone, files, message, work, None if exists else "HEAD")
        out["note"] = f"Committed to branch `{PUBLISH_BRANCH}` in {src}. Review: git diff HEAD...{PUBLISH_BRANCH}"
        return out

    slug = github_slug(src)
    name = slug[1] if slug else Path(src.removesuffix(".git").rstrip("/")).name or "repo"
    notes = []
    base = git(["rev-parse", "--abbrev-ref", "origin/HEAD"], cwd=clone, check=False).strip()
    base = base.removeprefix("origin/") if base and base != "origin/HEAD" else "main"
    if choice == "origin":
        try:
            _stack_and_push(clone, "origin", files, message, work)
            web = src.removesuffix(".git") if src.startswith("https://") else src
            out["pr_url"] = f"{web}/compare/{PUBLISH_BRANCH}"
            if slug:
                out["pr"] = {"repo": "/".join(slug), "head": PUBLISH_BRANCH, "base": base}
            notes.append(f"Pushed branch `{PUBLISH_BRANCH}` to {src}.")
        except RuntimeError as e:
            notes.append(f"Push to {src} failed (needs git credentials with write access): {_why(e)}\n"
                         f'Retry with: git -C "{clone}" push origin {PUBLISH_BRANCH}')
    elif choice == "fork":
        try:
            # POST .../forks is idempotent and returns the fork's real name (GitHub renames on a clash).
            full = gh(["api", "-X", "POST", f"repos/{slug[0]}/{slug[1]}/forks", "--jq", ".full_name"]).stdout.strip()
            fork = f"https://github.com/{full}.git"
            for attempt in range(4):  # a brand-new fork takes a few seconds to become pushable
                try:
                    _stack_and_push(clone, fork, files, message, work)
                    break
                except RuntimeError:
                    if attempt == 3:
                        raise
                    time.sleep(5)
            head = f"{full.split('/')[0]}:{PUBLISH_BRANCH}"
            out["pr_url"] = f"https://github.com/{slug[0]}/{slug[1]}/compare/{base}...{head}"
            out["pr"] = {"repo": "/".join(slug), "head": head, "base": base}
            notes.append(f"Forked to {full} and committed to branch `{PUBLISH_BRANCH}` there. "
                         "The owner is not notified until a pull request is opened.")
        except RuntimeError as e:
            git(["branch", "-f", PUBLISH_BRANCH, "HEAD"], cwd=clone, check=False)  # keep the local export usable
            notes.append(f"Fork or push failed: {_why(e)}")
    else:
        git(["branch", "-f", PUBLISH_BRANCH, "HEAD"], cwd=clone)
        notes.append("Not pushed to GitHub (you chose local only).")
    try:
        out["output_path"] = export_local(clone, name, task, result)
        notes.append(f"Full project with the change saved to {out['output_path']} (branch `{PUBLISH_BRANCH}`).")
    except Exception as e:
        notes.append(f"Could not save the local folder: {e}. The change is committed in {clone}")
    out["note"] = "\n".join(notes)
    return out


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
