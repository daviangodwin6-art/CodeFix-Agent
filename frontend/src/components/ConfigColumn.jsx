import { useRef } from "react";
import { finished, isHttps } from "../api.js";
import { CountUp, enter, useAnime } from "../motion.jsx";
import { CARD, Copy, Icon, plural, short } from "./ui.jsx";

export const TYPES = {
  debug: { option: "Debug", label: "Target Task / Bug Report", sample: "login fails when the email has capital letters" },
  feature: { option: "Feature", label: "Target Task / Feature Request",
             sample: "add a function email_domain(email) in auth/users.py that returns the part after the @, lowercased" },
};
const MODES = [["own", "My repo"], ["other", "Other's"], ["local", "Local"]];
const FIELD = "w-full h-10 bg-slate-50 border border-slate-200 text-slate-900 font-mono text-[14.5px] rounded-lg px-3.5 outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all";
const TILE = "bg-slate-50 border border-slate-200/80 p-2 rounded-lg min-w-0";
const TILE_LABEL = "text-[10px] text-slate-500 uppercase font-mono font-medium";

// `linked` is the active project when the Repository field still points at it; `conflict` names a busy project (HTTP 409).
function RunConfiguration({ form, setForm, me, repos, onRefreshRepos, busy, onRun, error, onDismissError, linked, conflict }) {
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const type = TYPES[form.taskType];
  const list = Array.isArray(repos) ? repos : null;

  function changeType(taskType) {
    const samples = Object.values(TYPES).map((t) => t.sample);
    const keep = !samples.includes(form.task.trim()); // keep typed text, and keep the box empty if it was emptied
    set({ taskType, task: keep ? form.task : TYPES[taskType].sample });
  }

  return (
    <section className={CARD + " p-[22px] flex flex-col gap-4"}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-[17.5px] text-slate-900">Run Configuration</h2>
        <select aria-label="What should the agent do?" value={form.taskType} disabled={busy} onChange={(e) => changeType(e.target.value)}
                className="font-mono text-[13.5px] bg-slate-50 text-slate-800 px-2 h-[30px] rounded-md border border-slate-200 cursor-pointer outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-100">
          {Object.entries(TYPES).map(([id, t]) => <option key={id} value={id}>{t.option}</option>)}
        </select>
      </div>

      {error && (
        <div role="alert" className="fade-in bg-rose-50 border border-rose-200 text-rose-900 p-3 rounded-lg flex items-start gap-2">
          <Icon name="error" className="text-[18px] text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-[13px] text-rose-800 break-words whitespace-pre-wrap leading-snug">{error}</div>
          <button type="button" aria-label="Dismiss error" onClick={onDismissError} className="text-rose-600 hover:text-rose-800 p-0.5">
            <Icon name="close" className="text-[15px]" />
          </button>
        </div>
      )}

      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); onRun(); }}>
        {busy ? ( // a run is on screen: the repository cannot change under it
          <input type="text" readOnly aria-label="Repository" value={form[form.mode].replace(/^https:\/\//, "")} className={FIELD} />
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="text-[15.5px] font-semibold text-slate-900 flex items-center justify-between gap-2">
              <label htmlFor={"repo-" + form.mode}>Repository</label>
              <span role="radiogroup" aria-label="Whose repository is it?" className="flex font-mono text-[12.5px] font-normal">
                {MODES.map(([id, text], i) => {
                  const off = id !== "local" && !me.signed_in;
                  return (
                    <button key={id} type="button" role="radio" aria-checked={form.mode === id} disabled={off}
                            title={off ? "Sign in with GitHub first" : undefined} onClick={() => set({ mode: id })}
                            className={"px-2.5 py-0.5 border transition-colors " + (i ? "-ml-px " : "rounded-l ") + (i === MODES.length - 1 ? "rounded-r " : "") +
                              (form.mode === id ? "bg-blue-50 text-blue-700 font-semibold border-blue-200 z-10 relative " : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50 ") +
                              (off ? "opacity-50 cursor-not-allowed" : "")}>
                      {text}
                    </button>
                  );
                })}
              </span>
            </div>
            <div className="flex items-center">
              {form.mode === "own" ? (
                <>
                  <select id="repo-own" value={form.own} onChange={(e) => set({ own: e.target.value })} disabled={!form.own && !(list && list.length)} className={FIELD}>
                    {/* a project's repository stays selectable even when it is not in the loaded list */}
                    {form.own && !(list || []).some((r) => r.url === form.own) && <option value={form.own}>{form.own.replace(/^https:\/\//, "")}</option>}
                    {!list ? !form.own && <option>Loading…</option>
                      : !list.length ? !form.own && <option>No repositories found</option>
                      : list.map((r) => <option key={r.url} value={r.url}>{r.name + (r.private ? "  (private)" : "")}</option>)}
                  </select>
                  <button type="button" aria-label="Refresh repository list" title="Refresh" onClick={onRefreshRepos}
                          className="ml-2 w-10 h-10 shrink-0 rounded-lg bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-600 border border-slate-200 transition flex items-center justify-center">
                    <Icon name="refresh" className="text-[18px]" />
                  </button>
                </>
              ) : form.mode === "other" ? (
                <input id="repo-other" type="text" value={form.other} onChange={(e) => set({ other: e.target.value })} autoComplete="off" spellCheck="false" className={FIELD} />
              ) : (
                <input id="repo-local" type="text" value={form.local} onChange={(e) => set({ local: e.target.value })} autoComplete="off" spellCheck="false" className={FIELD} />
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          <label htmlFor="task-input" className="text-[15.5px] font-semibold text-slate-900">{type.label}</label>
          <textarea id="task-input" rows="3" value={form.task} readOnly={busy} onChange={(e) => set({ task: e.target.value })}
                    placeholder="Describe the next bug or feature…"
                    className="w-full h-[95px] bg-white border border-slate-200 text-slate-900 text-[14.5px] rounded-lg px-3.5 py-3 outline-none placeholder:text-slate-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none leading-snug" />
        </div>

        <button type="submit" disabled={busy}
                className="w-full h-[49px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 active:scale-[0.99] text-white rounded-lg text-[15.5px] font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:bg-blue-300 disabled:cursor-not-allowed disabled:active:scale-100">
          {!busy && <Icon name="play_arrow" fill className="text-[20px]" />}
          <span>{busy ? "Running…" : "Execute Repair"}</span>
        </button>
      </form>

      {conflict && (
        <p role="status" className="fade-in rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13.5px] text-amber-900 leading-snug break-words">
          Project is busy. A run is already active on {conflict}. You can start a run on another project.
        </p>
      )}
      {linked && !busy && (
        <p className="font-mono text-[12.5px] text-slate-500 break-words">
          Continues from head {short(linked.head_sha)} · {plural(linked.changes_ahead_of_base, "earlier change")} kept
        </p>
      )}
    </section>
  );
}

export function VerifiedImports({ run }) {
  const items = finished(run) && Array.isArray(run.result.import_check) ? run.result.import_check : [];
  return (
    <section className={CARD + " p-4"}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
          <Icon name="search_check" className="text-[16px] text-slate-500" />
          Verified Imports &amp; Scope
        </span>
        {items.length > 0 && <span className="font-mono text-[10px] text-slate-400"><CountUp value={items.length} /> verified</span>}
      </div>
      {items.length ? (
        <div className="flex flex-col gap-1.5 font-mono text-xs">
          {items.map((item) => {
            const m = /^(.*) \(([^)]+)\)$/.exec(String(item)); // "auth.users (repo)"
            return (
              <div key={item} className="bg-slate-50 border border-slate-200/80 text-slate-700 px-2.5 py-1.5 rounded-md flex items-center justify-between gap-2">
                <span className="truncate" title={m ? m[1] : item}>{m ? m[1] : String(item)}</span>
                {m && <span className="text-[10px] text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200 shrink-0">{m[2]}</span>}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-slate-500 leading-snug">
          {finished(run) ? "The change added no new imports." : "Every import a change adds is checked to really exist. The list appears after a run."}
        </p>
      )}
    </section>
  );
}

export function RunMetadata({ run }) {
  const r = finished(run) ? run.result : null;
  const feature = r && r.task_type === "feature";
  return (
    <section className={CARD + " p-4 flex flex-col gap-3"}>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
          <Icon name="info" className="text-[16px] text-slate-500" />
          Run Metadata
        </span>
        {run && <span className="font-mono text-[10px] text-slate-500">#{run.id}</span>}
      </div>
      {!r ? (
        <p className="text-[11px] text-slate-500 leading-snug">{run ? "Filled in when the run finishes." : "No run yet."}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className={TILE}>
              <div className={TILE_LABEL}>Branch</div>
              <div className="font-mono text-xs font-semibold text-slate-800 truncate mt-0.5" title={r.branch}>{r.branch || "none"}</div>
            </div>
            <div className={TILE}>
              <div className={TILE_LABEL}>Attempts</div>
              <div className="font-mono text-xs font-semibold text-slate-800 mt-0.5"><CountUp value={r.attempts} /></div>
            </div>
            <div className={TILE}>
              <div className={TILE_LABEL}>{feature ? "Mode" : "Reproduced"}</div>
              <div className="font-mono text-xs font-semibold text-slate-800 mt-0.5"
                   title={feature ? undefined : "Did the new test fail on the original code before the fix?"}>
                {feature ? "feature" : r.syntax && r.syntax.only_syntax ? "n/a (syntax repair only)" : r.reproduced ? "yes" : "no"}
              </div>
            </div>
          </div>
          {[["Report", r.report_path], ["Commit", r.commit_sha]].filter(([, v]) => v).map(([label, value]) => (
            <div key={label}>
              <div className={TILE_LABEL + " mb-0.5"}>{label}</div>
              <div className="bg-slate-50 border border-slate-200/70 p-2 rounded-lg flex items-center justify-between text-slate-600 font-mono text-[11px]">
                {isHttps(value)
                  ? <a href={value} target="_blank" rel="noopener noreferrer" className="truncate text-blue-600 underline" title={value}>{value}</a>
                  : <span className="truncate text-slate-500" title={value}>{value}</span>}
                <Copy text={value} />
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

// Left column: the run form, then whatever the page puts under it (the Projects card).
export default function ConfigColumn({ children, ...props }) {
  const root = useRef(null);
  useAnime(root, () => enter(root.current.children, { delay: (el, i) => i * 90 }), []);
  return (
    <div ref={root} className="flex flex-col gap-[22px] min-w-0">
      <RunConfiguration {...props} />
      {children}
    </div>
  );
}
