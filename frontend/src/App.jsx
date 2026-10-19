import { useCallback, useEffect, useRef, useState } from "react";
import { api, finished, planSteps, post } from "./api.js";
import * as auth from "./auth.js";
import Login from "./components/Login.jsx";
import Header from "./components/Header.jsx";
import Composer, { TYPES } from "./components/ConfigColumn.jsx";
import Projects from "./components/Projects.jsx";
import ProjectView from "./components/ProjectView.jsx";
import RunView from "./components/Results.jsx";
import { CARD_CORNERS, KIND, LABEL, Logo, Notice, short, Spinner } from "./components/ui.jsx";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIGNED_OUT = { login: "", signed_in: false };
const SAMPLE = { mode: "local", own: "", other: "", local: "sample_repo", taskType: "debug", task: TYPES.debug.sample };
const isSample = (task) => Object.values(TYPES).some((t) => t.sample === task.trim());
const STEPS = [
  ["Understand", "Reads the repository and reproduces the problem."],
  ["Change", "Plans and writes the smallest patch that fits."],
  ["Test", "Runs the project's tests before and after the change."],
  ["Verify", "Checks for regressions and keeps the change only if it holds."],
];

export default function App() {
  const [me, setMe] = useState(SIGNED_OUT);
  const [online, setOnline] = useState(null); // null until the first /api/me answer
  const [form, setForm] = useState(SAMPLE);
  const [repos, setRepos] = useState(null); // null = not loaded for the current user
  const [projects, setProjects] = useState(null); // null = not loaded yet
  const [active, setActive] = useState(null); // the selected project: its detail plus `runs` (null while loading)
  const [link, setLink] = useState(null); // { mode, repo } the Repository field held when `active` was chosen
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(""); // name of a project that answered 409 "busy"
  const [elapsed, setElapsed] = useState(null);
  const session = useRef(0); // bumped whenever the page stops watching a run, so its polling loop stops updating the page
  // "Continue offline" on the login page; kept for this tab so a refresh does not ask again.
  const [offline, setOfflineState] = useState(() => {
    try { return sessionStorage.getItem("offline") === "1"; } catch (e) { return false; }
  });
  function setOffline(on) {
    setOfflineState(on);
    setError("");
    try { on ? sessionStorage.setItem("offline", "1") : sessionStorage.removeItem("offline"); } catch (e) { /* private mode */ }
  }

  const loadMe = useCallback(async () => {
    try {
      setMe(await api("/api/me"));
      setOnline(true);
    } catch (e) {
      setMe(SIGNED_OUT);
      setOnline(false);
    }
    setRepos(null); // the repo list belongs to whoever is signed in now
  }, []);
  useEffect(() => { loadMe(); }, [loadMe]);
  // Show a failed request. 401 means GitHub no longer accepts the sign-in: asking who we are again brings the login page back.
  const fail = useCallback((e) => {
    setError(e.message);
    if (e.status === 401) loadMe();
  }, [loadMe]);

  // GitHub modes need a sign-in.
  useEffect(() => {
    if (!me.signed_in && form.mode !== "local") setForm((f) => ({ ...f, mode: "local" }));
  }, [me.signed_in, form.mode]);

  const loadRepos = useCallback(async () => {
    setRepos("loading");
    try {
      const list = await api("/api/repos");
      setRepos(list);
      setForm((f) => ({ ...f, own: f.own || (list[0] ? list[0].url : "") })); // keep a repository a project put there
    } catch (e) {
      setRepos([]);
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    if (form.mode === "own" && me.signed_in && repos === null) loadRepos();
  }, [form.mode, me.signed_in, repos, loadRepos]);

  const loadProjects = useCallback(async () => {
    try {
      const list = await api("/api/projects");
      setProjects(list);
      return list;
    } catch (e) {
      setProjects([]);
      fail(e);
      return [];
    }
  }, [fail]);
  // The project list belongs to whoever is signed in now.
  useEffect(() => {
    if (online === null) return;
    session.current++;
    setActive(null);
    setRun(null);
    setBusy(false);
    setProjects(null);
    loadProjects();
  }, [online, me.login, me.signed_in, loadProjects]);

  // Detail and run history of one project; also what refreshes the open project after a run or an action.
  const loadActive = useCallback(async (id) => {
    const at = "/api/projects/" + encodeURIComponent(id);
    try {
      const [detail, runs] = await Promise.all([api(at), api(at + "/runs")]);
      const full = { ...detail, runs };
      setActive((a) => (a && a.project_id !== id ? a : full)); // another project was picked meanwhile
      return full;
    } catch (e) {
      fail(e);
      return null;
    }
  }, [fail]);
  const refresh = (id) => { loadProjects(); return loadActive(id); };

  async function authAction(action) {
    setError("");
    try { await action(); } catch (e) { setError(e.message); }
    loadMe();
  }

  // Poll one run until it finishes. Also used to pick up a run that was already going on a busy project.
  async function follow(id) {
    const mine = ++session.current;
    let started = Date.now();
    setBusy(true);
    setRun(null);
    setElapsed(0);
    const clock = setInterval(() => mine === session.current && setElapsed(Math.max(0, (Date.now() - started) / 1000)), 250);
    try {
      for (;;) {
        const state = await api("/api/run/" + encodeURIComponent(id));
        if (mine !== session.current) return;
        started = Date.parse(state.started_at) || started; // a run picked up midway has been going for a while
        setRun(state);
        if (finished(state)) {
          clearInterval(clock);
          if (state.duration_s != null) setElapsed(state.duration_s);
          if (state.project_id) refresh(state.project_id); // new head, new history entry
          break;
        }
        await sleep(1000);
      }
    } catch (e) {
      if (mine === session.current) setError(e.message);
    } finally {
      clearInterval(clock);
      if (mine === session.current) setBusy(false);
    }
  }

  // Stop showing a run (it keeps going on the server) and go back to the project view.
  function leaveRun() {
    session.current++;
    setRun(null);
    setBusy(false);
    setElapsed(null);
  }

  // Make a project the active one: the Repository field points at it, and the next run continues from its head.
  async function select(p) {
    const mode = (KIND[p.kind] || KIND.local).mode;
    leaveRun();
    setError("");
    setConflict("");
    setForm((f) => ({ ...f, mode, [mode]: p.source, task: isSample(f.task) ? "" : f.task }));
    setLink({ mode, repo: p.source });
    setActive({ ...p, runs: null });
    const mine = session.current;
    const full = await loadActive(p.project_id);
    if (mine === session.current) watchActive(full);
  }

  // If the project has a run going, show it (with what it was asked to do). Returns whether it did.
  function watchActive(full) {
    const item = full && full.busy && full.runs.find((r) => r.status === "running");
    if (!item) return false;
    setForm((f) => ({ ...f, task: item.task, taskType: TYPES[item.mode] ? item.mode : f.taskType }));
    follow(item.run_id);
    return true;
  }

  async function startRun() {
    if (busy) return;
    const repo = form[form.mode].trim();
    if (!repo) return setError("Choose or enter a repository first.");
    setBusy(true);
    setError("");
    setConflict("");
    setRun(null);
    try {
      const { id, project_id } = await post("/api/run", { mode: form.mode, repo, task: form.task.trim(), task_type: form.taskType });
      if (project_id) { // the run's project becomes the active one
        setLink({ mode: form.mode, repo });
        setActive((a) => (a && a.project_id === project_id ? a : null));
        refresh(project_id);
      }
      follow(id);
    } catch (e) {
      setBusy(false);
      if (e.status !== 409) return fail(e);
      // Busy is an answer, not a failure: say so, and show the run that is already going on that project.
      const id = e.detail && e.detail.project_id;
      const p = id && (await loadProjects()).find((x) => x.project_id === id);
      setConflict(p ? p.display_name : repoName);
      if (!p) return;
      setLink({ mode: form.mode, repo });
      setActive((a) => (a && a.project_id === id ? a : { ...p, runs: null }));
      watchActive(await loadActive(id));
    }
  }

  function rerun(item) {
    setForm((f) => ({ ...f, task: item.task, taskType: TYPES[item.mode] ? item.mode : f.taskType }));
    const box = document.getElementById("task-input");
    if (box) box.focus();
  }

  const steps = planSteps(run, form.taskType);
  const repoName = form[form.mode].trim().replace(/\.git$/, "").replace(/[\\/]+$/, "").split(/[\\/]/).pop();
  const linked = !!active && !!link && link.mode === form.mode && link.repo === form[form.mode].trim();
  const showRun = busy || !!run;
  const done = finished(run);

  const viewKey = showRun ? "run" : active ? "project:" + active.project_id : "home"; // "run" stays put while the first poll fills in the id

  // Stop watching the run on screen (it keeps going on the server) and show the project again, fresh.
  function leave() {
    leaveRun();
    if (active) refresh(active.project_id);
  }
  function goHome() {
    leaveRun();
    setActive(null);
    setLink(null);
    setConflict("");
    setError("");
    loadProjects();
  }

  // Move focus to the new view's heading when the view changes (not on first mount).
  const firstView = useRef(true);
  useEffect(() => {
    if (firstView.current) { firstView.current = false; return; }
    const t = document.getElementById("view-title");
    if (t) t.focus();
  }, [viewKey]);

  if (online === null) { // first /api/me answer decides between login page and console
    return (
      <div role="status" className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center text-ink-2">
        <Logo className="w-20 h-20" />
        <Spinner className="text-2xl text-accent-fg" />
        <p className={LABEL}>Connecting to the local server…</p>
      </div>
    );
  }
  if (!me.signed_in && !offline) {
    return <Login online={online} canSignIn={auth.configured} error={error}
                  onGitHub={() => authAction(auth.signIn)} onOffline={() => setOffline(true)} />;
  }

  const composer = (
    <Composer form={form} setForm={setForm} me={me} repos={repos} onRefreshRepos={loadRepos}
              busy={busy} onRun={startRun} linked={linked ? active : null} conflict={conflict} />
  );
  const crumbs = [{ label: "Home", onClick: goHome }];
  if (active) crumbs.push({ label: active.display_name + (active.head_sha ? " @ " + short(active.head_sha) : ""), mono: true, onClick: showRun ? leave : undefined });
  else if (repoName && showRun) crumbs.push({ label: repoName, mono: true });
  if (showRun) crumbs.push({ label: run ? "Run " + run.id : "Starting run…" });

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-accent focus:text-ink focus:border focus:border-accent-fg focus:px-3 focus:py-2 focus:font-mono focus:text-xs focus:font-semibold focus:uppercase focus:tracking-[0.1em]">Skip to content</a>
      <Header me={me} online={online} crumbs={crumbs}
              onSignIn={() => setOffline(false)} onSignOut={() => { setOffline(false); authAction(auth.signOut); }} />
      <div className="flex-1 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] 2xl:grid-cols-[21rem_minmax(0,1fr)]">
        <nav aria-label="Projects" className="bg-surface border-b border-line lg:border-b-0 lg:border-r lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:self-start">
          <Projects projects={projects} activeId={active ? active.project_id : ""} homeActive={viewKey === "home"} signedIn={me.signed_in}
                    onSelect={select} onNew={goHome} onSignIn={() => (auth.configured ? authAction(auth.signIn) : setOffline(false))} />
        </nav>
        <main id="main" tabIndex={-1} className="min-w-0 w-full max-w-[110rem] mx-auto p-4 lg:p-6 xl:px-8 flex flex-col gap-4 focus:outline-none">
          {error && <Notice tone="bad" onDismiss={() => setError("")}>{error}</Notice>}

          {showRun ? (
            <RunView run={run} busy={busy} steps={steps} elapsed={elapsed}
                     head={(run && run.result && run.result.head_before) || (linked && !done ? active.head_sha : "")}
                     project={linked ? active : null} task={form.task} taskType={form.taskType}
                     repoLabel={active ? active.display_name : repoName}
                     onBack={leave} backLabel={done ? (active ? "Back to project" : "Close run") : "Leave — run keeps going"} stored={false} />
          ) : active ? (
            <ProjectView key={active.project_id} project={active} composer={composer}
                         onChanged={() => refresh(active.project_id)} onRerun={rerun} onSignedOut={loadMe}
                         onWatch={async () => watchActive(await loadActive(active.project_id))}
                         onDeleted={() => { setActive(null); setLink(null); loadProjects(); }} />
          ) : (
            <>
              <div>
                <h1 id="view-title" tabIndex={-1} className="font-display text-2xl sm:text-3xl font-bold uppercase tracking-tight focus:outline-none">Start a new run</h1>
                <p className="mt-1 text-sm text-ink-2">Describe a bug or a feature and CodeFix changes the code, tests it and verifies the result.</p>
              </div>
              <div className={CARD_CORNERS + " hud-corners-red p-5 lg:p-6"}>{composer}</div>
              <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {STEPS.map(([name, text], i) => (
                  <li key={name} className="rounded-sm border border-line bg-surface px-4 py-3">
                    <span className="flex items-baseline gap-2 font-mono text-xs font-semibold">
                      <span className="text-gold">{String(i + 1).padStart(2, "0")}</span>
                      <span className="uppercase tracking-[0.12em] text-ink">{name}</span>
                    </span>
                    <span className="block mt-1.5 text-sm text-ink-2">{text}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
