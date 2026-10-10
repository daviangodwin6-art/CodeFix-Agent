"""The only module that starts other processes. Repo code never sees the agent's secrets.

`pip install` and `pytest` execute code from the repository being repaired (setup.py, conftest.py,
tests). A copy of os.environ would hand that code the LLM key and any GitHub token, so untrusted
commands get an environment built from an allowlist. gh is trusted: it inherits the environment and
receives the token. git is in between: it is our program, but it runs inside a working copy whose
.git/ folder the repo's tests could write to (hooks, config), so it gets the allowlisted environment
too, hooks are switched off, and only the commands that talk to a remote ever receive the token.

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


NETWORK = {"clone", "fetch", "push", "ls-remote"}  # the only git commands that ever see the token
NET_PASS = {"SSH_AUTH_SOCK", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"}  # what reaching a remote may need
# Repo code that ran earlier (conftest.py, tests) can write .git/hooks and .git/config in the working copy.
# These switch off the ways git would then run a program of the repo's choosing; -c beats the repo's config.
NO_REPO_PROGRAMS = ["-c", f"core.hooksPath={os.devnull}", "-c", "core.fsmonitor=false", "-c", "protocol.ext.allow=never"]


def run_trusted_git(args, cwd, token=None, timeout=300):
    """Run git with hooks off and no secrets. Only a command that talks to a remote gets the token, and only in
    its own environment: never in a URL, a remote or a config file."""
    cmd = ["git", "-c", "core.autocrlf=false", "-c", "user.name=agent", "-c", "user.email=agent@localhost", *NO_REPO_PROGRAMS]
    env = untrusted_env()
    if args and args[0] in NETWORK:
        env.update({k: v for k, v in os.environ.items() if k.upper() in NET_PASS})
        if token:  # authenticate as the signed-in user: gh hands GH_TOKEN to git, nothing is stored
            cmd += ["-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential"]
            env["GH_TOKEN"] = token
    # ponytail: a config key planted in .git/config (diff.external, a filter, core.sshCommand) can still run a
    # program, but it now gets the same secret-free environment the tests already had. On fetch/push it
    # would see the token; a container, or a bare mirror kept outside the working copy, closes that.
    return _run(cmd + list(args), cwd, timeout, env)


def run_trusted_gh(args, token=None, timeout=120):
    """Run the GitHub CLI, as `token` if given. Raises FileNotFoundError if gh is not installed."""
    env = {**os.environ, "GH_PROMPT_DISABLED": "1", **({"GH_TOKEN": token} if token else {})}
    return _run(["gh", *args], None, timeout, env)
