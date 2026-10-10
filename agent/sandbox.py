"""The only module that starts other processes. Repo code never sees the agent's secrets.

`pip install` and `pytest` execute code from the repository being repaired (setup.py, conftest.py,
tests). A copy of os.environ would hand that code the LLM key and any GitHub token, so untrusted
commands get an environment built from an allowlist. git and gh are trusted: they inherit the
environment (they need the user's config) and are the only commands that ever receive the token.

ponytail: environment isolation only. Repo code still runs as the same OS user with file and
network access; running these steps in a container is the real fix (see README).
"""
import os
import subprocess

TimeoutExpired = subprocess.TimeoutExpired  # so callers can catch it without importing subprocess

ALLOW = {
    "PATH", "LANG", "LC_ALL", "TZ", "TEMP", "TMP", "TMPDIR", "HOME",
    # Windows: Python, pip and sockets do not start without these
    "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "PATHEXT", "USERPROFILE", "APPDATA", "LOCALAPPDATA",
    "PROGRAMDATA", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE",
}
# Second layer: these never pass, even if someone later widens ALLOW or passes them as extra_env.
DENY_WORDS = ("KEY", "TOKEN", "SECRET", "PASSWORD", "CREDENTIAL")
DENY_PREFIXES = ("GITHUB_", "GH_", "GEMINI_", "GOOGLE_", "XAI_", "OPENAI_", "ANTHROPIC_", "FIREBASE_", "AWS_")
FIXED = {"PIP_NO_INPUT": "1", "PYTHONIOENCODING": "utf-8", "GIT_TERMINAL_PROMPT": "0", "PYTHONDONTWRITEBYTECODE": "1"}


def _denied(name):
    name = name.upper()  # Windows environment names are case-insensitive
    return name.startswith(DENY_PREFIXES) or any(word in name for word in DENY_WORDS)


def untrusted_env(extra_env=None):
    """The environment for a command that runs repo code: allowlist, then denylist, then fixed values."""
    env = {k: v for k, v in os.environ.items() if k.upper() in ALLOW}
    env.update(extra_env or {})
    return {**{k: v for k, v in env.items() if not _denied(k)}, **FIXED}


def _run(cmd, cwd, timeout, env):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, encoding="utf-8", errors="replace",
                          timeout=timeout, env=env)


def run_untrusted(args, cwd, timeout, extra_env=None):
    """Run a command that executes repo code (venv, pip, pytest, python probes). Raises TimeoutExpired."""
    return _run([str(a) for a in args], cwd, timeout, untrusted_env(extra_env))


def run_trusted_git(args, cwd, token=None, timeout=300):
    """Run git. The token exists only in this one command's environment: never in a URL, a remote or a config file."""
    cmd = ["git", "-c", "core.autocrlf=false", "-c", "user.name=agent", "-c", "user.email=agent@localhost"]
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    if token:  # authenticate as the signed-in user: gh hands GH_TOKEN to git, nothing is stored
        cmd += ["-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential"]
        env["GH_TOKEN"] = token
    return _run(cmd + list(args), cwd, timeout, env)


def run_trusted_gh(args, token=None, timeout=120):
    """Run the GitHub CLI, as `token` if given. Raises FileNotFoundError if gh is not installed."""
    env = {**os.environ, "GH_PROMPT_DISABLED": "1", **({"GH_TOKEN": token} if token else {})}
    return _run(["gh", *args], None, timeout, env)
