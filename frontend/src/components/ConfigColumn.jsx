import { useRef } from "react";
import { finished, isHttps } from "../api.js";
import { CountUp, enter, useAnime } from "../motion.jsx";
import { CARD, Copy, Icon } from "./ui.jsx";

export const TYPES = {
  debug: { option: "Debug", label: "Target Task / Bug Report", sample: "login fails when the email has capital letters", },
  feature: { option: "Add feature", label: "Target Task / Feature Request",
             sample: "add a function email_domain(email) in auth/users.py that returns the part after the @, lowercased", },
};
const MODES = [["own", "My repo"], ["other", "Other's"], ["local", "Local"]];
const FIELD = "w-full bg-slate-50 border border-slate-200 text-slate-900 font-mono text-xs rounded-lg pl-8 pr-2.5 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all";
const TILE = "bg-slate-50 border border-slate-200/80 p-2 rounded-lg min-w-0";
const TILE_LABEL = "text-[10px] text-slate-500 uppercase font-mono font-medium";

function RunConfiguration({ form, setForm, me, repos, onRefreshRepos, busy, onRun, error, onDismissError, onReset }) {
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const type = TYPES[form.taskType];

  function changeType(taskType) {
    const samples = Object.values(TYPES).map((t) => t.sample);
    const keep = form.task.trim() && !samples.includes(form.task.trim()); // keep typed text
    set({ taskType, task: keep ? form.task : TYPES[taskType].sample });
  }

  return (
    <section className={CARD + " p-4 flex flex-col gap-3.5"}>
      <div className="flex items-center justify-between pb-1 border-b border-slate-100">
        <div className="flex items-center gap-1.5">
          <Icon name="tune" className="text-[18px] text-blue-600" />
          <h2 className="font-semibold text-sm text-slate-900">Run Configuration</h2>
        </div>
        <select aria-label="What should the agent do?" value={form.taskType} onChange={(e) => changeType(e.target.value)}
                className="font-mono text-[11px] bg-slate-100 text-slate-700 pl-1.5 pr-1 py-0.5 rounded border border-slate-200/60 cursor-pointer outline-none focus:ring-1 focus:ring-blue-500">
          {Object.entries(TYPES).map(([id, t]) => <option key={id} value={id}>{t.option}</option>)}
        </select>
      </div>

      {error && (
        <div role="alert" className="fade-in bg-rose-50 border border-rose-200 text-rose-900 p-2.5 rounded-lg flex items-start gap-2">
          <Icon name="error" className="text-[18px] text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-[11px] text-rose-800 break-words whitespace-pre-wrap leading-snug">{error}</div>
          <button type="button" aria-label="Dismiss error" onClick={onDismissError} className="text-rose-600 hover:text-rose-800 p-0.5">
            <Icon name="close" className="text-[15px]" />
          </button>
        </div>
      )}

      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); onRun(); }}>
        <div className="flex flex-col gap-1">
          <div className="text-xs font-semibold text-slate-700 flex items-center justify-between gap-2">
            <label htmlFor={"repo-" + form.mode}>Repository</label>
            <span role="radiogroup" aria-label="Whose repository is it?" className="flex font-mono text-[10px] font-normal">
              {MODES.map(([id, text], i) => {
                const off = id !== "local" && !me.signed_in;
                return (
                  <button key={id} type="button" role="radio" aria-checked={form.mode === id} disabled={off}
                          title={off ? "Sign in with GitHub first" : undefined} onClick={() => set({ mode: id })}
                          className={"px-1.5 py-0.5 border transition-colors " + (i ? "-ml-px " : "rounded-l ") + (i === MODES.length - 1 ? "rounded-r " : "") +
                            (form.mode === id ? "bg-blue-50 text-blue-700 font-semibold border-blue-200 z-10 relative " : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50 ") +
                            (off ? "opacity-50 cursor-not-allowed" : "")}>
                    {text}
                  </button>
                );
              })}
            </span>
          </div>
          <div className="relative flex items-center">
            <Icon name="folder" className="absolute left-2.5 text-[17px] text-slate-400" />
            {form.mode === "own" ? (
              <>
                <select id="repo-own" value={form.own} onChange={(e) => set({ own: e.target.value })}
                        disabled={!Array.isArray(repos) || !repos.length} className={FIELD}>
                  {!Array.isArray(repos) ? <option>Loading…</option>
                    : !repos.length ? <option>No repositories found</option>
                    : repos.map((r) => <option key={r.url} value={r.url}>{r.name + (r.private ? "  (private)" : "")}</option>)}
                </select>
                <button type="button" aria-label="Refresh repository list" title="Refresh" onClick={onRefreshRepos}
                        className="ml-1.5 p-1.5 shrink-0 rounded-lg bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-600 border border-slate-200 transition flex">
                  <Icon name="refresh" className="text-[16px]" />
                </button>
              </>
            ) : form.mode === "other" ? (
              <input id="repo-other" type="text" value={form.other} onChange={(e) => set({ other: e.target.value })} autoComplete="off" spellCheck="false" className={FIELD} />
            ) : (
              <input id="repo-local" type="text" value={form.local} onChange={(e) => set({ local: e.target.value })} autoComplete="off" spellCheck="false" className={FIELD} />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="task-input" className="text-xs font-semibold text-slate-700">{type.label}</label>
          <textarea id="task-input" rows="3" value={form.task} onChange={(e) => set({ task: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all resize-none leading-relaxed" />
        </div>

        <div className="flex items-center gap-2 pt-0.5">
          <button type="submit" disabled={busy}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 active:scale-[0.98] text-white py-2 px-3.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-75 disabled:cursor-not-allowed disabled:active:scale-100">
            <Icon name={busy ? "sync" : "play_arrow"} className={"text-[16px]" + (busy ? " animate-spin" : "")} />
            <span>{busy ? "Running Agent..." : "Execute Repair"}</span>
          </button>
          <button type="button" title="Reset: clear the result and restore the sample inputs" aria-label="Reset" disabled={busy} onClick={onReset}
                  className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-600 border border-slate-200 transition flex disabled:opacity-50 disabled:cursor-not-allowed">
            <Icon name="restart_alt" className="text-[16px]" />
          </button>
        </div>
      </form>
    </section>
  );
}

function VerifiedImports({ run }) {
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

function RunMetadata({ run }) {
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
                {feature ? "feature" : r.reproduced ? "yes" : "no"}
              </div>
            </div>
          </div>
          {[["Report", r.report_path], ["Local folder", r.output_path], ["Compare link", r.pr_url]].filter(([, v]) => v).map(([label, value]) => (
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

export default function ConfigColumn(props) {
  const root = useRef(null);
  useAnime(root, () => enter(root.current.children, { delay: (el, i) => i * 90 }), []);
  return (
    <div ref={root} className="lg:col-span-3 flex flex-col gap-4">
      <RunConfiguration {...props} />
      <VerifiedImports run={props.run} />
      <RunMetadata run={props.run} />
    </div>
  );
}
