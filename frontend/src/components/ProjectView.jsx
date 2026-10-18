import { useRef, useState } from "react";
import { api, isHttps, post } from "../api.js";
import { enter, useAnime } from "../motion.jsx";
import Results, { Changes } from "./Results.jsx";
import { ago, BUTTON, CARD, Dialog, duration, Icon, KindBadge, plural, PRIMARY, short } from "./ui.jsx";

const PILL = {
  success: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25", failed: "bg-rose-500/10 text-rose-300 border-rose-500/25",
  env_failed: "bg-amber-500/10 text-amber-300 border-amber-500/25", running: "bg-blue-500/10 text-blue-300 border-blue-500/25",
};
const MODE = { debug: "Debug", feature: "Feature" };
const NOTE = {
  emerald: "bg-emerald-500/10 border-emerald-500/25 text-emerald-200", amber: "bg-amber-500/10 border-amber-500/25 text-amber-200",
  rose: "bg-rose-500/10 border-rose-500/25 text-rose-200", slate: "bg-white/[0.03] border-white/[0.08] text-slate-300",
};

function runMeta(r) {
  const live = r.status === "running";
  return [r.run_id, MODE[r.mode] || r.mode, duration(r.duration_s),
    r.syntax_stage ? "syntax stage" : r.attempts != null && plural(r.attempts, "attempt"),
    !live && (r.commit_sha ? "commit " + short(r.commit_sha) : "head unchanged"),
    r.env_status && "env " + r.env_status + (r.env_reason ? " (" + r.env_reason + ")" : "")].filter(Boolean).join(" · ");
}

function ResetDialog({ p, url, onClose, onDone }) {
  // Past successful runs, except the one the project is already at.
  const options = (p.runs || []).filter((r) => r.status === "success" && r.commit_sha && r.commit_sha !== p.head_sha);
  const [to, setTo] = useState(options[0] ? options[0].run_id : "base");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const choices = [{ id: "base", title: "Base", meta: [p.base_label || p.base_ref, short(p.base_sha)].filter(Boolean).join(" · ") },
    ...options.map((r) => ({ id: r.run_id, title: "After “" + r.task + "”", meta: r.run_id + " · " + short(r.commit_sha) }))];

  async function reset(close) {
    setWorking(true);
    setError("");
    try {
      onDone(await post(url + "/reset", { to }));
      close();
    } catch (e) {
      setError(e.status === 409 ? "Project is busy. Wait for the active run to finish, then reset." : e.message);
      setWorking(false);
    }
  }

  return (
    <Dialog title={"Reset " + p.display_name + "?"} onClose={onClose}>
      {(close) => (
        <>
          <p className="mt-2 text-[15.5px] text-slate-400 leading-relaxed">
            Choose the point to go back to. Later changes leave the project branch, but they are not deleted.
          </p>
          <fieldset className="mt-5">
            <legend className="text-[14px] font-semibold text-slate-50 mb-2">Reset to</legend>
            <div className="flex flex-col gap-2.5 max-h-[40vh] overflow-auto">
              {choices.map((c) => (
                <label key={c.id} className={"flex items-center gap-4 rounded-lg border px-5 py-3.5 cursor-pointer transition-colors " +
                  (to === c.id ? "bg-blue-500/10 border-blue-500" : "bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.03]")}>
                  <input type="radio" name="reset-to" value={c.id} checked={to === c.id} data-autofocus={to === c.id ? "" : undefined} onChange={() => setTo(c.id)} className="w-4 h-4 accent-blue-600 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-[15.5px] font-medium text-slate-50 break-words">{c.title}</span>
                    <span className="block mt-0.5 font-mono text-[12.5px] text-slate-400 break-words">{c.meta}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="mt-5 rounded-lg border border-blue-500/25 bg-blue-500/10 px-4 py-3.5 text-[14.5px] text-blue-200 leading-relaxed break-words">
            The current head <code className="font-mono">{short(p.head_sha)}</code> will be kept as an archive tag{" "}
            <code className="font-mono">codefix/archive/&lt;timestamp&gt;</code>, so it is never lost.
          </p>
          {error && <p role="alert" className="mt-3 text-[13.5px] text-rose-300 break-words">{error}</p>}
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={close} className={BUTTON + " !h-[46px] !px-5 !text-[15.5px]"}>Cancel</button>
            <button type="button" disabled={working} onClick={() => reset(close)} className={PRIMARY + " !h-[46px] !px-5 !text-[15.5px]"}>
              {working ? "Resetting…" : "Reset project"}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}

function DeleteDialog({ p, url, onClose, onDone }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  async function remove(e, close) {
    e.preventDefault();
    if (typed !== p.display_name) return;
    setWorking(true);
    setError("");
    try {
      await api(url, { method: "DELETE" });
      close();
      onDone();
    } catch (err) {
      setError(err.status === 409 ? "Project is busy. Wait for the active run to finish, then delete." : err.message);
      setWorking(false);
    }
  }

  return (
    <Dialog title={"Delete " + p.display_name + "?"} onClose={onClose}>
      {(close) => (
        <form onSubmit={(e) => remove(e, close)}>
          <p className="mt-2 text-[15.5px] text-slate-400 leading-relaxed">
            This removes the project's workspace, its environment and its run history from CodeFix.
            {p.kind === "local" ? " Your original folder is not touched." : " The repository on GitHub is not touched."} This cannot be undone.
          </p>
          <label htmlFor="delete-confirm" className="block mt-5 text-[14px] font-semibold text-slate-50 break-words">
            Type <span className="font-mono">{p.display_name}</span> to confirm
          </label>
          <input id="delete-confirm" type="text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck="false"
                 className="mt-2 w-full h-[42px] px-3.5 rounded-lg border border-white/[0.14] font-mono text-[14.5px] outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
          {error && <p role="alert" className="mt-3 text-[13.5px] text-rose-300 break-words">{error}</p>}
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={close} className={BUTTON + " !h-[46px] !px-5 !text-[15.5px]"}>Cancel</button>
            <button type="submit" disabled={working || typed !== p.display_name}
                    className="h-[46px] px-5 rounded-lg bg-rose-600 hover:bg-rose-700 text-[15.5px] font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed">
              {working ? "Deleting…" : "Delete project"}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

// A stored run or the cumulative diff, shown in place of the project card.
function Detail({ label, title, meta, onBack, children }) {
  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div className={CARD + " px-5 py-4 flex items-center gap-4"}>
        <button type="button" onClick={onBack} className={BUTTON + " flex items-center gap-1.5 !h-[36px] !px-3 !text-[13.5px]"}>
          <Icon name="arrow_back" className="text-[16px]" />
          <span>Back to project</span>
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-mono text-[10.5px] leading-4 uppercase tracking-wide px-1.5 rounded border border-white/[0.14] text-slate-400 shrink-0">{label}</span>
            <h2 className="font-semibold text-[15.5px] text-slate-50 truncate">{title}</h2>
          </div>
          <p className="mt-0.5 font-mono text-[12.5px] text-slate-400 break-words">{meta}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export default function ProjectView({ project: p, onChanged, onDeleted, onRerun, onSignedOut }) {
  const [dialog, setDialog] = useState("");
  const [view, setView] = useState(null); // null | { run, item } | { diff }
  const [note, setNote] = useState(null); // result of the last action: { tone, text, list?, url?, canWrite? }
  const [working, setWorking] = useState("");
  const url = "/api/projects/" + encodeURIComponent(p.project_id);
  const local = p.kind === "local";
  const env = p.env || {};
  const tests = p.locked_tests || {};
  const history = useRef(null);
  useAnime(history, () => enter(history.current.children, { y: [10, 0], delay: (el, i) => i * 60 }), [p.project_id, !p.runs]);

  // Every project action reports its outcome in the note under the buttons; a busy project (409) is not an error.
  async function act(name, action) {
    setWorking(name);
    setNote(null);
    try {
      setNote(await action());
    } catch (e) {
      setNote(e.status === 409
        ? { tone: "amber", text: "Project is busy. A run is active on " + p.display_name + "; try again when it finishes." }
        : { tone: "rose", text: e.message });
      if (e.status === 401) onSignedOut(); // GitHub no longer accepts the sign-in: back to the login page
    }
    setWorking("");
  }

  const viewChanges = () => act("diff", async () => { setView({ diff: (await api(url + "/diff?from=base")).diff }); return null; });
  const openRun = (item) => act("run", async () => { setView({ item, run: await api(url + "/runs/" + encodeURIComponent(item.run_id)) }); return null; });
  const rebuild = () => act("env", async () => {
    await api(url + "/venv", { method: "DELETE" });
    onChanged();
    return { tone: "slate", text: "Environment removed. The next run builds a fresh one." };
  });
  const sync = () => act("sync", async () => {
    const s = await post(url + "/sync");
    onChanged();
    if (s.status === "conflict") return { tone: "amber", text: "Not synced: upstream conflicts with the project's changes. Nothing was changed. Conflicting files:", list: s.conflicts || [] };
    return s.status === "ok" ? { tone: "emerald", text: "Synced with upstream." } : { tone: "slate", text: "This project has no upstream to sync with." };
  });
  // Export writes a patch file; writing into the user's own folder is a second, explicit step.
  function exportChanges(intoFolder) {
    if (intoFolder && !window.confirm("Write this project's changes into " + p.source + "?\n\nFiles in your original folder will be changed.")) return;
    act("export", async () => {
      const out = await post(url + "/export", intoFolder ? { confirm: true } : {});
      return out.written_to ? { tone: "emerald", text: "Changes written to " + out.written_to }
        : { tone: "emerald", text: "Patch file written: " + out.patch_path, canWrite: true };
    });
  }
  // Asks first: a pull request notifies another person.
  function openPr() {
    if (!window.confirm("Open or update the pull request for " + p.display_name + "?\n\nThe repository owner will be notified, under your GitHub account.")) return;
    act("pr", async () => {
      const out = await post(url + "/pr");
      onChanged();
      return { tone: "emerald", text: "Pull request:", url: out.url };
    });
  }

  if (view && view.run) {
    const timings = (view.run.step_timings || []).map((t) => t.step + " " + duration(t.duration_s)).join(" · ");
    return (
      <Detail label="Past run" title={view.item.task} meta={runMeta(view.item) + (timings ? "  |  " + timings : "")} onBack={() => setView(null)}>
        <Results run={view.run} busy={false} steps={[]} />
      </Detail>
    );
  }
  if (view) {
    return (
      <Detail label="All changes" title={p.display_name} onBack={() => setView(null)}
              meta={"base " + short(p.base_sha) + " → head " + short(p.head_sha) + " · " + plural(p.changes_ahead_of_base, "change")}>
        {view.diff.trim() ? <Changes r={view} /> : <div className={CARD + " p-6 text-[14px] text-slate-400"}>No changes ahead of base.</div>}
      </Detail>
    );
  }

  const tiles = [
    ["Branch", p.branch, "text-slate-50"],
    ["Head", short(p.head_sha), "text-slate-50"],
    ["Ahead of base", plural(p.changes_ahead_of_base, "change"), "text-slate-50"],
    ["Environment", env.state === "ready" ? "ready" + (env.python ? " · py" + env.python : "") : env.state === "evicted" ? "evicted" : "not built yet",
      env.state === "ready" ? "text-emerald-300" : "text-slate-400"],
    ["Locked tests", tests.total + " (" + tests.added_by_runs + " added by runs)", "text-slate-50"],
  ];

  return (
    <section aria-labelledby="project-title" className={CARD + " p-[30px] min-w-0"}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 id="project-title" className="font-semibold text-[24px] leading-8 tracking-tight text-slate-50 truncate">{p.display_name}</h2>
            <KindBadge kind={p.kind} />
          </div>
          <p className="mt-1.5 font-mono text-[13.5px] text-slate-400 break-words">
            {local ? "Snapshot of " + p.source + " · your original folder is unchanged" : p.source}
          </p>
        </div>
        <button type="button" disabled={p.busy} onClick={() => setDialog("delete")}
                className="h-[38px] px-3.5 rounded-lg border border-rose-500/25 bg-white/[0.04] hover:bg-rose-500/10 text-[14.5px] font-medium text-rose-300 whitespace-nowrap transition disabled:opacity-50 disabled:cursor-not-allowed">
          Delete project
        </button>
      </div>

      <dl className="mt-5 grid grid-cols-2 xl:grid-cols-5 gap-3.5">
        {tiles.map(([label, value, tone]) => (
          <div key={label} className="border border-white/[0.08] rounded-lg px-4 py-3.5 min-w-0">
            <dt className="text-[13.5px] text-slate-400">{label}</dt>
            <dd className={"mt-1 font-mono text-[14.5px] break-words " + tone}>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <button type="button" disabled={!!working} onClick={viewChanges} className={PRIMARY}>View all changes</button>
        {local ? <button type="button" disabled={!!working || p.busy} onClick={() => exportChanges(false)} className={BUTTON}>Export patch</button> : (
          <>
            <button type="button" disabled={!!working || p.busy} onClick={sync} className={BUTTON}>Sync with upstream</button>
            <button type="button" disabled={!!working || p.busy} onClick={openPr} className={BUTTON}>{p.pr_url ? "Update PR" : "Open PR"}</button>
            {isHttps(p.pr_url) && <a href={p.pr_url} target="_blank" rel="noopener noreferrer" className="text-[13.5px] text-blue-300 underline">View pull request</a>}
          </>
        )}
        <button type="button" disabled={!!working || p.busy} onClick={() => setDialog("reset")} className={BUTTON}>Reset to…</button>
        <button type="button" disabled={!!working || p.busy} onClick={rebuild} className={BUTTON}>Rebuild environment</button>
        {local && <span className="pl-1 text-[13px] text-slate-400">Sync with upstream and Open PR appear for GitHub projects</span>}
      </div>

      <div role="status">
        {note && (
          <div className={"fade-in mt-4 rounded-lg border px-4 py-3 text-[13.5px] leading-relaxed break-words " + NOTE[note.tone]}>
            <span>{note.text}</span>
            {note.url && <> {isHttps(note.url)
              ? <a href={note.url} target="_blank" rel="noopener noreferrer" className="underline font-medium">{note.url}</a> : note.url}</>}
            {note.list && <ul className="mt-1.5 font-mono text-[12.5px] list-disc pl-5">{note.list.map((item) => <li key={item}>{String(item)}</li>)}</ul>}
            {note.canWrite && (
              <button type="button" onClick={() => exportChanges(true)} className="ml-3 underline font-medium">Write into the original folder…</button>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 pt-6 border-t border-white/[0.08] flex items-baseline justify-between gap-3">
        <h3 className="font-semibold text-[16.5px] text-slate-50">Run history</h3>
        {p.runs && <span className="font-mono text-[12.5px] text-slate-400">{plural(p.runs.length, "run")} · newest first</span>}
      </div>
      {!p.runs ? <p className="mt-4 text-[13.5px] text-slate-400">Loading run history…</p>
        : !p.runs.length ? <p className="mt-4 text-[13.5px] text-slate-400">No runs yet.</p> : (
          <ol ref={history} className="mt-4 flex flex-col gap-3">
            {p.runs.map((r) => (
              <li key={r.run_id} className="lift flex items-center gap-5 border border-white/[0.08] bg-white/[0.02] rounded-xl px-[18px] py-3.5">
                <span className={"w-[90px] text-center font-mono text-[12.5px] py-1 rounded-md border shrink-0 " + (PILL[r.status] || PILL.failed)}>
                  {String(r.status).replace("_", " ")}
                </span>
                <button type="button" title="Show this run's stored result" disabled={r.status === "running" || !!working} onClick={() => openRun(r)}
                        className="group flex-1 min-w-0 text-left rounded">
                  <span className="block text-[15.5px] font-medium text-slate-50 truncate group-enabled:group-hover:text-blue-300">{r.task}</span>
                  <span className="block mt-0.5 font-mono text-[12.5px] text-slate-400 truncate">{runMeta(r)}</span>
                </button>
                <button type="button" onClick={() => onRerun(r)}
                        className="h-[34px] px-3 rounded-lg border border-blue-500/25 bg-white/[0.04] hover:bg-blue-500/10 text-[13.5px] font-medium text-blue-300 whitespace-nowrap transition shrink-0">
                  Re-run task
                </button>
              </li>
            ))}
          </ol>
        )}
      <p className="mt-4 pl-[18px] font-mono text-[12.5px] text-slate-400 break-words">
        {["base", p.base_label || p.base_ref, short(p.base_sha)].filter(Boolean).join(" · ")}
      </p>
      {(p.events || []).length > 0 && ( // resets, syncs and exports are not runs: they are listed here
        <ul aria-label="Project events" className="mt-2 pl-[18px] flex flex-col gap-1 font-mono text-[12.5px] text-slate-400">
          {p.events.map((e, i) => <li key={i} className="break-words">{[e.kind, e.detail, ago(e.at)].filter(Boolean).join(" · ")}</li>)}
        </ul>
      )}

      {dialog === "reset" && p.runs && ( // the choices come from the run history
        <ResetDialog p={p} url={url} onClose={() => setDialog("")}
                     onDone={(out) => { onChanged(); setNote({ tone: "emerald", text: "Project reset to " + short(out.head_sha) + ". The previous head is kept as " + out.archive_tag + "." }); }} />
      )}
      {dialog === "delete" && <DeleteDialog p={p} url={url} onClose={() => setDialog("")} onDone={onDeleted} />}
    </section>
  );
}
