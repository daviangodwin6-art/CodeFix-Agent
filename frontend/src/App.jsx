import { useCallback, useEffect, useRef, useState } from "react";
import { api, finished, planSteps, post } from "./api.js";
import * as auth from "./auth.js";
import Login from "./components/Login.jsx";
import Header from "./components/Header.jsx";
import ConfigColumn, { TYPES } from "./components/ConfigColumn.jsx";
import Progress from "./components/Progress.jsx";
import Results from "./components/Results.jsx";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIGNED_OUT = { login: "", signed_in: false };
const SAMPLE = { mode: "local", own: "", other: "", local: "sample_repo", taskType: "debug", task: TYPES.debug.sample };

export default function App() {
  const [me, setMe] = useState(SIGNED_OUT);
  const [online, setOnline] = useState(null); // null until the first /api/me answer
  const [form, setForm] = useState(SAMPLE);
  const [repos, setRepos] = useState(null); // null = not loaded for the current user
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(null);
  const [answered, setAnswered] = useState(""); // run id whose approval question was answered
  const session = useRef(0); // bumped by Reset Session so an old polling loop stops updating the page
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

  // GitHub modes need a sign-in.
  useEffect(() => {
    if (!me.signed_in && form.mode !== "local") setForm((f) => ({ ...f, mode: "local" }));
  }, [me.signed_in, form.mode]);

  const loadRepos = useCallback(async () => {
    setRepos("loading");
    try {
      const list = await api("/api/repos");
      setRepos(list);
      setForm((f) => ({ ...f, own: list.some((r) => r.url === f.own) ? f.own : (list[0] ? list[0].url : "") }));
    } catch (e) {
      setRepos([]);
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    if (form.mode === "own" && me.signed_in && repos === null) loadRepos();
  }, [form.mode, me.signed_in, repos, loadRepos]);

  async function authAction(action) {
    setError("");
    try { await action(); } catch (e) { setError(e.message); }
    loadMe();
  }

  async function startRun() {
    if (busy) return;
    const repo = form[form.mode].trim();
    if (!repo) return setError("Choose or enter a repository first.");
    const mine = ++session.current;
    const started = Date.now();
    setBusy(true);
    setError("");
    setRun(null);
    setAnswered("");
    setElapsed(0);
    const clock = setInterval(() => mine === session.current && setElapsed((Date.now() - started) / 1000), 100);
    try {
      const { id } = await post("/api/run", { mode: form.mode, repo, task: form.task.trim(), task_type: form.taskType });
      for (;;) {
        const state = await api("/api/run/" + encodeURIComponent(id));
        if (mine !== session.current) return;
        setRun(state);
        if (finished(state)) break;
        await sleep(1000);
      }
    } catch (e) {
      if (mine === session.current) setError(e.message);
    } finally {
      clearInterval(clock);
      if (mine === session.current) setBusy(false);
    }
  }

  async function approve(choice) {
    setAnswered(run.id); // answered: stop showing the question while the run continues
    try { await post("/api/run/" + encodeURIComponent(run.id) + "/approve", { choice }); } catch (e) { setError(e.message); }
  }

  function reset() {
    session.current++;
    setRun(null);
    setBusy(false);
    setError("");
    setElapsed(null);
    setForm((f) => ({ ...SAMPLE, own: f.own })); // back to the sample inputs
  }

  const steps = planSteps(run, form.taskType);
  const repoName = form[form.mode].trim().replace(/\.git$/, "").replace(/[\\/]+$/, "").split(/[\\/]/).pop();

  if (online === null) return null; // first /api/me answer decides between login page and console
  if (!me.signed_in && !offline) {
    return <Login online={online} canSignIn={auth.configured} error={error}
                  onGitHub={() => authAction(auth.signIn)} onOffline={() => setOffline(true)} />;
  }

  return (
    <div className="font-headline min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A] antialiased">
      <Header me={me} online={online} repoName={repoName}
              onSignIn={() => setOffline(false)} onSignOut={() => { setOffline(false); authAction(auth.signOut); }} />
      <main className="flex-1 w-full max-w-[1920px] mx-auto p-4 lg:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <ConfigColumn form={form} setForm={setForm} me={me} repos={repos} onRefreshRepos={loadRepos} run={run}
                        busy={busy} onRun={startRun} error={error} onDismissError={() => setError("")} onReset={reset} />
          <Progress run={run} busy={busy} steps={steps} elapsed={elapsed}
                    showApproval={!!run && !!run.approval && answered !== run.id} onApprove={approve} />
          <Results run={run} busy={busy} steps={steps} onError={setError}
                   onPrOpened={(url) => setRun((r) => ({ ...r, result: { ...r.result, pr_opened_url: url } }))} />
        </div>
      </main>
    </div>
  );
}
