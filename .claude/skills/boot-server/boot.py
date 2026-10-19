"""Boot (or stop) the CodeFix Agent server: python server.py on 127.0.0.1:8000. Stdlib only.

python .claude/skills/boot-server/boot.py [--fake] [--home DIR] [--no-build] [--install] [--log FILE]
python .claude/skills/boot-server/boot.py --stop
"""
import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FRONTEND = ROOT / "frontend"
URL = "http://127.0.0.1:8000"
PID_FILE = Path(tempfile.gettempdir()) / "codefix-server.pid"


def me():
    """GET /api/me, or None when nothing answers on the port."""
    try:
        with urllib.request.urlopen(URL + "/api/me", timeout=2) as r:
            return json.loads(r.read())
    except Exception:
        return None


def python():
    """The project's .venv interpreter when there is one (README setup), else this one."""
    for p in (ROOT / ".venv" / "bin" / "python", ROOT / ".venv" / "Scripts" / "python.exe"):
        if p.exists():
            return str(p)
    return sys.executable


def dotenv():
    """KEY=value pairs from .env; the server loads it too, but real environment variables win (load_dotenv)."""
    path, out = ROOT / ".env", {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip("'\"")
    return out


def dist_stale():
    """True when frontend/dist is missing or older than any file the build reads."""
    index = FRONTEND / "dist" / "index.html"
    if not index.exists():
        return True
    sources = [*(FRONTEND / "src").rglob("*"), *(FRONTEND / f for f in
               ("index.html", "package.json", "package-lock.json", "tailwind.config.js", "vite.config.js", "postcss.config.js"))]
    built = index.stat().st_mtime
    return any(p.is_file() and p.stat().st_mtime > built for p in sources)


def build():
    npm = shutil.which("npm")
    if not npm:
        print("! frontend/dist is out of date but npm is not installed; serving the committed build.")
        return
    if not (FRONTEND / "node_modules").exists():
        print("> npm install")
        subprocess.run([npm, "install"], cwd=FRONTEND, check=True)
    print("> npm run build")
    subprocess.run([npm, "run", "build"], cwd=FRONTEND, check=True)


def stop():
    if not PID_FILE.exists():
        print("No server started by this script (no pid file)." + (" Something else answers on :8000." if me() else ""))
        return 0
    pid = int(PID_FILE.read_text())
    try:
        os.kill(pid, signal.SIGTERM)  # TerminateProcess on Windows
        print(f"Stopped server (pid {pid}).")
    except OSError:
        print(f"Server pid {pid} was not running.")
    PID_FILE.unlink(missing_ok=True)
    return 0


def main():
    ap = argparse.ArgumentParser(description="Boot the CodeFix Agent server on 127.0.0.1:8000.")
    ap.add_argument("--fake", action="store_true", help="LLM_PROVIDER=fake: scripted offline LLM (works on sample_repo only)")
    ap.add_argument("--home", help="CODEFIX_HOME: where projects/ and data/ go (default: the repo folder)")
    ap.add_argument("--no-build", action="store_true", help="never rebuild frontend/dist")
    ap.add_argument("--install", action="store_true", help="pip install -r requirements.txt when imports are missing")
    ap.add_argument("--log", default=str(Path(tempfile.gettempdir()) / "codefix-server.log"), help="server output file")
    ap.add_argument("--stop", action="store_true", help="stop the server this script started")
    a = ap.parse_args()
    if a.stop:
        return stop()

    running = me()
    if running is not None:
        print(f"Already running at {URL} (/api/me -> {json.dumps(running)}). Stop it first with --stop to change settings.")
        return 0

    py = python()
    if subprocess.run([py, "-c", "import fastapi, uvicorn, dotenv"], capture_output=True).returncode:
        if not a.install:
            print(f"! Python packages missing for {py}. Re-run with --install, or: {py} -m pip install -r requirements.txt")
            return 1
        subprocess.run([py, "-m", "pip", "install", "-r", str(ROOT / "requirements.txt")], check=True)

    if not a.no_build and dist_stale():
        build()

    env = dict(os.environ)
    if a.fake:
        env["LLM_PROVIDER"] = "fake"
    if a.home:
        Path(a.home).mkdir(parents=True, exist_ok=True)
        env["CODEFIX_HOME"] = str(Path(a.home).resolve())
    settings = {**dotenv(), **{k: v for k, v in env.items() if k in ("LLM_PROVIDER", "GEMINI_API_KEY")}}
    provider = settings.get("LLM_PROVIDER") or "gemini"
    if provider != "fake" and not settings.get("GEMINI_API_KEY"):
        print("! No GEMINI_API_KEY in the environment or .env: the UI works, but runs will fail. Use --fake for the offline demo.")

    log = open(a.log, "w", encoding="utf-8")
    detach = ({"creationflags": subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt"
              else {"start_new_session": True})
    proc = subprocess.Popen([py, "server.py"], cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, **detach)
    PID_FILE.write_text(str(proc.pid))

    for _ in range(60):  # up to 30 s
        if proc.poll() is not None:
            print(f"! Server exited with code {proc.returncode}. Last log lines ({a.log}):")
            print("".join(Path(a.log).read_text(encoding="utf-8", errors="replace").splitlines(True)[-20:]))
            PID_FILE.unlink(missing_ok=True)
            return 1
        answer = me()
        if answer is not None:
            print(f"Server up (pid {proc.pid}), LLM provider: {provider}, log: {a.log}")
            print(f"/api/me -> {json.dumps(answer)}")
            print("Open http://localhost:8000 (use localhost, not 127.0.0.1, for GitHub sign-in).")
            return 0
        time.sleep(0.5)
    print(f"! No answer from {URL}/api/me after 30 s; the server is still starting or stuck. Log: {a.log}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
