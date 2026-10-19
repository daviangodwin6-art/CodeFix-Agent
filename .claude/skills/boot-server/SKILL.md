---
name: boot-server
description: Boot (or stop) the CodeFix Agent server — FastAPI `server.py` on 127.0.0.1:8000 serving the React page from `frontend/dist`. Use when asked to start, boot, run, restart or stop the server or app, open the UI, try the app offline, or before screenshotting or clicking through the frontend.
---

# Boot the CodeFix Agent server

One command does it. Run it from the repo root:

```
python .claude/skills/boot-server/boot.py --fake
```

The script (`boot.py`, stdlib only, works on Windows and Linux):
1. Exits early if something already answers `GET /api/me` on :8000, and says so. Use `--stop` first to restart with other settings.
2. Uses `.venv`'s Python when there is one. Checks that `fastapi`, `uvicorn` and `dotenv` import; `--install` runs `pip install -r requirements.txt` if they don't.
3. Rebuilds `frontend/dist` (`npm install` if needed, then `npm run build`) only when a file under `frontend/src` or the frontend config is newer than `dist/index.html`. `--no-build` skips this. Without npm it serves the committed build.
4. Starts `server.py` detached and logs to `<tmp>/codefix-server.log` (`--log FILE` to change). Waits up to 30 s for `/api/me`, then prints the pid, the LLM provider and the `/api/me` answer.

Options:

| Flag | Effect |
|---|---|
| `--fake` | `LLM_PROVIDER=fake`: scripted offline LLM. It only knows `sample_repo`, so pick Local mode with `sample_repo`. |
| `--home DIR` | `CODEFIX_HOME=DIR`: keep `projects/` and `data/` out of the repo folder (use a scratch dir for throwaway sessions). |
| `--install` | Install missing Python packages. |
| `--no-build` | Never rebuild the frontend. |
| `--stop` | Stop the server this script started (pid file in the temp dir). |

Without `--fake`, the server uses `.env`. Real environment variables win over `.env`. If there is no `GEMINI_API_KEY`, the script warns: the UI still works, but runs fail.

## Using it
- Open **http://localhost:8000**. GitHub sign-in (Firebase) rejects `127.0.0.1`, and needs `frontend/src/firebase-config.js` filled in. Without that, click **Continue offline** (local folders only).
- A quick check without a browser: `curl -s localhost:8000/api/me` → `{"login":"","signed_in":false,...}`.
- To start a run from the shell, the server only accepts same-origin writes, so send the header:
  `curl -s -X POST localhost:8000/api/run -H 'content-type: application/json' -H 'origin: http://localhost:8000' -d '{"mode":"local","repo":"sample_repo","task":"login fails when the email has capital letters","task_type":"debug"}'`
  Then poll `GET /api/run/<id>` until `status` is no longer `running`.
- Screenshots: drive http://localhost:8000 with Playwright. In cloud containers, launch Chromium from `/opt/pw-browsers`; don't run `playwright install`.

## Gotchas
- The server binds to 127.0.0.1 only on purpose, because it runs the test suites of whatever repo it is given. Don't change the host to reach it from elsewhere.
- **Runs end in `env_failed` with `invalid peer certificate: UnknownIssuer`**: this happens behind a TLS-intercepting proxy (e.g. Claude Code cloud containers). The sandbox deliberately strips CA variables from the commands that run repo code, so `uv` can't trust the proxy. Fix it at machine level, not in code: `mkdir -p ~/.config/uv && printf 'native-tls = true\n' > ~/.config/uv/uv.toml`.
- `frontend/dist` is committed. After changing `frontend/src`, rebuild (the script does it) and commit `dist` together with the source.
- A second fake run on the same project fails by design: the scripted patch no longer matches the already-fixed code. That is handy for seeing the failed-run screens. Use a fresh `--home` for a clean slate.
