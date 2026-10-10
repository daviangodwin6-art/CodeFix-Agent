# Subprocess inventory (Phase 0, commit 949fa6c)

Every place the product starts another process. "Repo code" means the command can execute code from
the repository being repaired.

| File | Function | Runs | Repo code? | Env today |
| --- | --- | --- | --- | --- |
| `agent/repo.py:51` | `git()` | `git` (clone, init, add, commit, checkout, clean, stash, diff, fetch, push, worktree, branch, rev-parse, status) | No (git hooks are not installed by clone) | full `os.environ` + `GIT_TERMINAL_PROMPT=0`; `GH_TOKEN` and `credential.helper=!gh auth git-credential` only when a token is set |
| `agent/repo.py:114` | `gh()` | `gh` (api, repo list, pr create) | No | full `os.environ` + `GH_PROMPT_DISABLED=1`; `GH_TOKEN` when a token is set |
| `agent/runner.py:16` | `_run()` via `setup_env()` | `python -m venv`, `pip install pytest -r requirements.txt`, `pip install -e .` | **Yes** (setup.py, build backends) | full `os.environ` + `PYTHONDONTWRITEBYTECODE=1` |
| `agent/runner.py:16` | `_run()` via `run_tests()` | `python -m pytest` | **Yes** (conftest.py, tests, imports) | full `os.environ` + `PYTHONDONTWRITEBYTECODE=1` |
| `agent/edits.py:164` | `check()` | venv `python -c` import probe (`importlib.util.find_spec`) | **Yes** (finding a spec can import a parent package) | inherited `os.environ` |

No `Popen`, `check_output`, `check_call` or `os.system` anywhere in `agent/`, `server.py` or `cli.py`.

Notes:
- No token is ever embedded in a URL or written to `.git/config`; the token travels as `GH_TOKEN`
  in the environment of the single git or gh command.
- `tests/` call `subprocess.run` directly to build fixture repos; that is outside the product.
- `tests/test_server.py` patches `repo_mod.subprocess.run` (`captured_env`); it must follow the call
  sites when they move.
