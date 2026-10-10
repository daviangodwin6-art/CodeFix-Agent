# PSI09 AI Software Engineering Agent

HackNEX problem HNX26PSI09. Give it a Python repository and a task in plain text. It finds the
right file, makes a small change, adds a test, and proves with before/after test runs that
nothing that worked before is broken.

## What it does

```
repo + task -> working copy on a new branch -> baseline pytest -> repo map -> LLM picks files
  Debug:        LLM proposes fix + new test -> code checks it -> new test must FAIL on the original code
  Add feature:  LLM proposes change (may add new files) + new test -> code checks it
            -> full pytest again -> compare with baseline (same check for both modes)
            -> keep (commit + report) or revert and retry (max MAX_ATTEMPTS, default 5)
```

Two modes, chosen with the **Debug / Add feature** toggle on the page (CLI: `--feature`):

- **Debug** fixes a bug by editing existing files only. Its new test is first run against the untouched code and
  must fail there, which proves the test really catches the bug; then it must pass after the fix.
- **Add feature** adds what the request describes and may create new source files. Its test is the agent's own
  reading of the request, so if the request names a function or module, the agent is told to use exactly that name.

Ordinary code runs every step. The LLM is used in exactly two bounded calls (pick files, propose an
edit) and never touches the repository directly. Code, not the prompt, enforces the two rules that
cost the most points:

- **Existing tests must still pass.** Every test that passed at baseline must pass after the change,
  or the change is reverted. Existing test files and `conftest.py` are locked; the agent can only add
  a new test file.
- **No made-up APIs or imports.** Every new import is verified to exist in the standard library, the
  repository (including the imported name), or the installed packages. Otherwise the attempt is rejected.

## Technologies, models and components (declaration)

| Component | Use |
| --- | --- |
| Python 3.11+ (stdlib: `subprocess`, `venv`, `ast`, `xml.etree`) | the agent itself |
| Git | working copy, branch, diff, revert |
| GitHub CLI (`gh`) and the GitHub API | check write access, list your repos, fork, open a pull request |
| Firebase Authentication (web SDK loaded from gstatic.com) + a GitHub OAuth app | optional "Sign in with GitHub" on the page |
| pytest | runs the target repository's tests and our own |
| Google Gemini API (`google-genai`), models set by `GEMINI_MODEL` (`gemini-3.7-flash`, fallback `gemini-3.5-flash-lite`) | the LLM, hosted, pre-trained, not fine-tuned |
| FastAPI + uvicorn | local API and static file server |
| python-dotenv | loads `.env` |
| React + Vite + Tailwind CSS, anime.js | web page (built files are committed, Node is only needed to change it) |

No datasets. No agent framework. AI coding tools were used to write this code; the team reviewed it.

## Install

Windows, Python 3.11+ and Git on PATH.

```
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env
```

## Configure

Edit `.env` (it is gitignored; never commit it):

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | key from Google AI Studio (aistudio.google.com, "Get API key") |
| `GEMINI_MODEL` | Gemini model id; a comma-separated list adds fallbacks tried when a model is overloaded or out of quota |
| `LLM_PROVIDER` | `gemini`, or `fake` for scripted offline responses (works only on `sample_repo`) |
| `MAX_ATTEMPTS` | edit retry cap (default 5) |
| `TEST_TIMEOUT` | seconds before a test run is killed (default 300) |
| `MAX_CACHED_VENVS` | how many project environments are kept (default 10); beyond that the least recently used idle one is deleted and rebuilt on its next run |
| `CODEFIX_HOME` | where `projects/` and `data/` are kept (default: this folder) |

## Run

Web page:

```
.venv\Scripts\python server.py
```

then open http://127.0.0.1:8000. The server binds to 127.0.0.1 only, because it executes the test
suite of whatever repository it is given. Only point it at repositories you trust.

The page starts on a login screen: **Continue with GitHub** (needs the Firebase setup below) or **Continue
offline**, which works on local folders only.

The page is a React app in `frontend/` (Vite + Tailwind). Its built files in `frontend/dist/` are committed, so
Node is only needed to change the page: `cd frontend`, `npm install`, `npm run build`.

Command line:

```
.venv\Scripts\python cli.py sample_repo "login fails when the email has capital letters"
.venv\Scripts\python cli.py https://github.com/someone/somerepo.git "describe the bug or feature"
.venv\Scripts\python cli.py --sync --reset-to base sample_repo
```

`--feature` marks the task as a feature request, `--sync` rebases the project onto its upstream default
branch first, `--reset-to <base|run_id>` first moves the project head (the old head is kept as a tag).

Our own tests (offline, fake LLM, about 4 minutes; only the tests marked `real_env` build a real venv):

```
.venv\Scripts\python -m pytest tests -q
```

## Sign in with GitHub (Firebase; needed for GitHub repos on the page)

Lets anyone use the page with their own GitHub account and repositories, including private ones.

1. Firebase console -> your project -> **Build -> Authentication -> Get started -> Sign-in method -> GitHub ->
   Enable**. Copy the authorization callback URL it shows (`https://<project-id>.firebaseapp.com/__/auth/handler`).
2. GitHub -> **Settings -> Developer settings -> OAuth Apps -> New OAuth App**: homepage `http://localhost:8000`,
   callback URL from step 1. Copy the Client ID, generate a client secret.
3. Back in Firebase's GitHub provider panel: paste the Client ID and client secret, **Save**. The secret lives
   only there; it must never be put in this repository.
4. Firebase -> **Project settings -> General -> Your apps -> Add app -> Web**: copy the `firebaseConfig` values into
   `frontend/src/firebase-config.js` (they are public identifiers, not secrets), then rebuild the page:
   `cd frontend`, `npm install`, `npm run build`.
5. Start the server and open **http://localhost:8000** (Firebase does not accept `127.0.0.1`). Click
   **Sign in with GitHub**.

The GitHub access token is requested with the `repo` scope, sent only to the local server, kept in memory, and
gone when you sign out or the server stops. The GitHub CLI (`gh`) must still be installed, but need not be logged in.

## Reproduce the demonstrated result

`sample_repo/` is "tinyauth", a small auth module with a real bug: `register()` stores emails
lowercased, `login()` looks them up as typed, so `Alice@Example.com` cannot log in. Its 6 tests pass
and do not cover the bug.

**Input**

- repo: `sample_repo`
- task: `login fails when the email has capital letters`

**Output** (`projects/<project_id>/runs/<run_id>/report.md`, also shown in the CLI and web page)

```
[ ok] prepare: workspace clean (new project on branch codefix/sample_repo)
[ ok] environment: env rebuilt (first run)
[ ok] baseline: 6 passed, 0 failed, 6 total
[ ok] map: 5 Python files
[ ok] localize: auth/login.py, auth/users.py, tests/test_login.py
[ ok] edit #1: 2 files written, imports verified
[ ok] verify #1: 7 passed, 0 failed, 0 regressions
[ ok] commit to project: 3f2a9c1 on codefix/sample_repo

STATUS: success
baseline: 6 passed, 0 failed, 6 total
after:    7 passed, 0 failed, 7 total
regressions: 0  new tests: 1  attempts: 1

 def login(email, password):
-    user = get_user(email)
+    user = get_user(email.strip().lower())
```

plus one new file, `tests/test_login_email_case.py`.

## Projects

Every repository you run a task on becomes a **project**, kept in `projects/<project_id>/`:

- `workspace/`: a git working copy on branch `codefix/<name>`. Changes from earlier runs stay, and the next
  run continues from them. A successful run adds exactly one commit (`codefix: <mode>: <task> [run <id>]`);
  any other outcome puts the head and the files back as they were.
- `venv/`: the project's own environment, never shared with another project. It is reused while the
  dependency files are unchanged (`env reused`) and rebuilt otherwise (`env rebuilt (deps changed)`).
- `runs/<run_id>/`: that run's `report.md`, state and JUnit files. The run list lives in `data/codefix.sqlite`
  (metadata only: no tokens, keys or file contents) and survives a restart.

A test added by a successful run is an existing, locked test for every later run and part of its baseline,
so earlier fixes stay protected. One run at a time per project; different projects run side by side.

On the web page you choose whose repository it is:

- **My GitHub repo** (picked from a list of your repositories) and **Someone else's public repo**: the
  repository is cloned into the project. Nothing is pushed by a run. **Open pull request** pushes the project
  branch (to the repository, or to a fork in your account when you cannot write to it) and opens one pull
  request per project, which later pushes update.
- **Local folder**: a snapshot is used. Your folder is never modified, unless you choose **Export** and
  confirm writing the changes back; by default Export writes a `.patch` file to `projects/<id>/exports/`.

Per project you can also **reset** to the base or to an earlier successful run (the current head is first
tagged `codefix/archive/<time>`, so nothing is lost) and **sync** with upstream (a rebase onto the latest
default branch; on a conflict it is aborted, nothing changes, and the conflicting files are listed).

GitHub actions run as whoever is signed in: the page shows the account, and projects belong to that account.
The page starts signed out and only local folders work until someone clicks **Sign in with GitHub** (setup
above). `cli.py` uses the GitHub CLI login of this PC (`gh auth login`) instead.

## Data pipeline

1. **Input**: repository (local folder or git URL) and task text, from the web form or the CLI.
2. **prepare** (`agent/projects.py`, `agent/repo.py`): first run: copy or clone into the project's
   `workspace/` and create branch `codefix/<name>`. Later runs: make sure the workspace is clean.
3. **environment** (`agent/envmgr.py`, `agent/runner.py`): reuse the project's venv, or rebuild it (`uv` if
   installed, else `pip`) with pytest and the repository's `requirements.txt` / package. If this fails
   the run stops as `env_failed` with the real pip output; the agent does not guess.
4. **baseline**: full pytest run, parsed from JUnit XML into `{test id: passed|failed|error|skipped}`.
5. **map**: every Python file with its functions and classes, built with `ast`.
6. **localize** (LLM call 1, `agent/prompts.py`): task + map + baseline failures -> up to 5 file
   paths. Paths that do not exist are dropped.
7. **edit** (LLM call 2): task + those files' contents (+ the previous rejection, on a retry) ->
   JSON `{explanation, edits: [{path, search, replace}], new_test: {path, content}}`.
8. **apply + check** (`agent/edits.py`): test lock, search text must match exactly once, syntax
   check, import existence check. Files that do not parse before the edit are listed to the model, which is told
   to fix all their syntax errors at once.
9. **reproduce** (debug mode only): the new test runs against the original code and must fail there. A crash
   inside the repository's own code on import counts; a mistake in the test file itself does not.
   **verify**: full pytest run again, compared per test with the baseline.
10. **decide** (`agent/pipeline.py`): any rule violation, regression, or failing new test -> `git`
    revert, and the error text goes back into step 7 (at most `MAX_ATTEMPTS` times).
11. **commit to project**: one commit on the project branch, or the head put back if the run did not
    succeed. `agent/report.py` writes `report.md` either way: explanation, before/after table,
    regressions, new tests, verified imports, steps with timings, and the diff.

## Core reasoning mechanism

A fixed pipeline with a bounded LLM loop ("Design B" in our brief), not a free agent loop. The model
reasons only about *which files* and *what edit*; branching, baseline, comparison, the retry cap and
revert are plain code a weak model cannot skip. A scripted fake LLM (`LLM_PROVIDER=fake`,
`tests/fake_llm_tinyauth.json`) drives the whole pipeline offline, so a failure can be traced to our
code or to the model.

## Code map

| Path | Role |
| --- | --- |
| `agent/pipeline.py` | the whole flow in one file: step order, retry loop, revert rule |
| `agent/projects.py` | projects: identity, database, one-run-at-a-time lock, workspace, reset, sync, export, pull request |
| `agent/envmgr.py` | one venv per project: dependency hash, reuse or rebuild, eviction |
| `agent/repo.py` | git: clone or snapshot, revert, commit, push, repo map |
| `agent/runner.py` | venv build, dependency install, pytest, JUnit parsing, regression compare |
| `agent/edits.py` | apply edits; test lock; syntax and import existence checks |
| `agent/sandbox.py` | the only file that starts processes; secret-free environment for repo code |
| `agent/llm.py` | the only file that talks to Gemini (or the fake) |
| `agent/prompts.py` | the two prompts |
| `agent/report.py` | writes `report.md` |
| `server.py`, `frontend/` | API (below) and web page |
| `cli.py` | same pipeline from a terminal |
| `sample_repo/` | demo repository with a known bug |
| `tests/` | end-to-end and safety-rule tests |

### API

| Request | Does |
| --- | --- |
| `POST /api/run` | start a run on the repository's project; `409` if that project is busy |
| `GET /api/run/{id}` | state of a run (live, or stored) |
| `GET /api/projects`, `GET /api/projects/{id}` | your projects; one project with base and archive tags |
| `GET /api/projects/{id}/runs`, `.../runs/{run_id}` | run history, newest first; one stored run with step timings |
| `GET /api/projects/{id}/diff?from=base\|<run_id>` | changes from the base, or since that run, up to the head |
| `POST /api/projects/{id}/reset` `{to}` | move the head to `base` or a run; returns the archive tag |
| `POST /api/projects/{id}/sync` | rebase onto upstream: `ok`, `conflict` (+ files) or `not_applicable` |
| `POST /api/projects/{id}/export` `{confirm}` | local projects: patch file, or write into the folder with `confirm: true` |
| `POST /api/projects/{id}/pr` | push the project branch, open or reuse the project's pull request |
| `DELETE /api/projects/{id}/venv`, `DELETE /api/projects/{id}` | delete the environment; delete the project |

A project of another user answers `404`. Actions on a project answer `409` while a run is going on it.

## Security model and residual risks

`pip install` and `pytest` execute code from the repository being repaired (`setup.py`,
`conftest.py`, the tests). The agent treats that code as untrusted:

- Every process is started by `agent/sandbox.py`; a test fails if any other file under `agent/`
  uses `subprocess`.
- Commands that run repo code (venv, pip, pytest, the import probe) get an environment built from a
  short allowlist (`PATH`, temp and profile folders, Windows essentials), never a copy of the
  agent's own. A denylist then removes anything named like a secret (`*KEY*`, `*TOKEN*`, `*SECRET*`,
  `*PASSWORD*`, `*CREDENTIAL*`, `GH_*`, `GITHUB_*`, `GEMINI_*`, `GOOGLE_*`, `OPENAI_*`, `AWS_*`, ...).
  So `GEMINI_API_KEY` and the GitHub token are not visible to repo code.
- The GitHub token is passed only to `git` and `gh`, in the environment of that one command. It is
  never put in a URL, a remote or a config file, and a clone whose `.git/config` contains it is refused.

Residual risks, not solved here: repo code still runs as the same OS user as the agent. It can read
that user's files (for example `~/.git-credentials` and the `gh` config, which hold GitHub
credentials if the PC is logged in), and it has full network access, so it could send them anywhere.
Only run the agent on repositories you would be willing to run `pytest` on yourself. The real fix is
running the environment, test and edit-check steps in a container with no credentials and no
network; that is not built.

## Scope

**Minimum viable solution (built):** Python + pytest repositories; plain-text tasks; persistent projects
(workspace on its own branch, own environment, run history); baseline vs after comparison per test; locked existing tests; new test in a new file;
import existence check; retry cap with revert; `env_failed` / `failed` outcomes that never leave a
half-applied change; CLI, API, web page, report file; fake LLM mode.

**Known limits:** the import check covers imports, not every attribute or function call (the full
test run catches most invented calls at runtime). Tests are run once, so a flaky test can look like a
regression. A repository with no tests has no baseline; the report says so. Local repositories are
snapshotted without their git history. The one-run-per-project lock lives in the server process, so do
not run `cli.py` and the server on the same project at the same moment.

**Known limit of Add feature:** hidden tests may expect names or signatures the request did not spell out; the agent can only follow what the request says.

**Stretch goals (not built):** separate sessions for several people sharing one server (one signed-in user at a time today); JavaScript (`npm test`) adapter; rerunning failed tests once as a flaky guard; keyword-search fallback for localization; fetching
GitHub issue links.
