import { useCallback, useEffect, useRef, useState } from "react";
import { api, finished, planSteps, post } from "./api.js";
import * as auth from "./auth.js";
import Login from "./components/Login.jsx";
import Header from "./components/Header.jsx";
import ConfigColumn, { RunMetadata, TYPES, VerifiedImports } from "./components/ConfigColumn.jsx";
import Progress, { BuildsOn } from "./components/Progress.jsx";
import Projects from "./components/Projects.jsx";
import ProjectView from "./components/ProjectView.jsx";
import Results from "./components/Results.jsx";
import { BUTTON, Icon, KIND } from "./components/ui.jsx";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIGNED_OUT = { login: "", signed_in: false };
const SAMPLE = { mode: "local", own: "", other: "", local: "sample_repo", taskType: "debug", task: TYPES.debug.sample };
const isSample = (task) => Object.values(TYPES).some((t) => t.sample === task.trim());
// Column widths: project view | live run | finished run
const GRID = {
  idle: "lg:grid-cols-[minmax(0,32fr)_minmax(0,68fr)]",
  live: "lg:grid-cols-[minmax(0,30fr)_minmax(0,44fr)_minmax(0,23fr)]",
  done: "lg:grid-cols-[minmax(0,30fr)_minmax(0,28fr)_minmax(0,42fr)]",
};

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

  if (online === null) return null; // first /api/me answer decides between login page and console
  if (!me.signed_in && !offline) {
    return <Login online={online} canSignIn={auth.configured} error={error}
                  onGitHub={() => authAction(auth.signIn)} onOffline={() => setOffline(true)} />;
  }

  return (
    <div className="font-headline min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A] antialiased">
      <Header me={me} online={online} repoName={repoName} project={linked ? active : null}
              onSignIn={() => setOffline(false)} onSignOut={() => { setOffline(false); authAction(auth.signOut); }} />
      <main className="flex-1 w-full max-w-[1920px] mx-auto p-4 lg:px-8 lg:py-7">
        <div className={"grid grid-cols-1 gap-7 " + (done ? "items-start " + GRID.done : "lg:min-h-[calc(100vh-136px)] " + (showRun ? GRID.live : GRID.idle))}>
          <ConfigColumn form={form} setForm={setForm} me={me} repos={repos} onRefreshRepos={loadRepos}
                        busy={busy} onRun={startRun} error={error} onDismissError={() => setError("")}
                        linked={linked ? active : null} conflict={conflict}>
            <Projects projects={projects} activeId={active ? active.project_id : ""} compact={showRun} signedIn={me.signed_in}
                      onSelect={select} onSignIn={() => (auth.configured ? authAction(auth.signIn) : setOffline(false))} />
          </ConfigColumn>

          {showRun ? (
            <>
              <div className="flex flex-col gap-4 min-w-0">
                <Progress run={run} busy={busy} steps={steps} elapsed={elapsed} className={done ? "" : "flex-1"}
                          head={(run && run.result && run.result.head_before) || (linked && !done ? active.head_sha : "")} />
                {done && <RunMetadata run={run} />}
                {done && <VerifiedImports run={run} />}
              </div>
              {done ? (
                <div className="flex flex-col gap-4 min-w-0">
                  <button type="button" onClick={leaveRun} className={BUTTON + " self-start flex items-center gap-1.5 !h-[36px] !px-3 !text-[13.5px]"}>
                    <Icon name="arrow_back" className="text-[16px]" />
                    <span>{active ? "Back to project" : "Close run"}</span>
                  </button>
                  <Results run={run} busy={busy} steps={steps} />
                </div>
              ) : <BuildsOn project={linked ? active : null} run={run} />}
            </>
          ) : active ? (
            <ProjectView key={active.project_id} project={active} onChanged={() => refresh(active.project_id)} onRerun={rerun}
                         onSignedOut={loadMe}
                         onDeleted={() => { setActive(null); setLink(null); loadProjects(); }} />
          ) : <Results run={null} busy={false} steps={steps} />}
        </div>
      </main>
    </div>
  );
}
