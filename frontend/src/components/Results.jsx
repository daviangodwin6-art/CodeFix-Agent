import { useMemo, useRef, useState } from "react";
import { animate, utils } from "animejs";
import { finished } from "../api.js";
import { CountUp, enter, pop, useAnime } from "../motion.jsx";
import { CARD, Icon } from "./ui.jsx";

// Unified diff -> [{ path, add, del, lines: [{ kind: "hunk" | "add" | "del" | "ctx", no, text }] }]
export function parseDiff(diff) {
  const files = [];
  let file = null, oldNo = 0, newNo = 0;
  for (const line of (diff || "").split("\n")) {
    const head = /^diff --git a\/.* b\/(.*)$/.exec(line);
    if (head) { files.push(file = { path: head[1], add: 0, del: 0, lines: [] }); continue; }
    if (!file) continue;
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) { oldNo = Number(hunk[1]); newNo = Number(hunk[2]); file.lines.push({ kind: "hunk", text: line }); continue; }
    if (!file.lines.length || line.startsWith("\\")) continue; // file header lines, "\ No newline at end of file"
    if (line.startsWith("+")) { file.add++; file.lines.push({ kind: "add", no: newNo++, text: line.slice(1) }); }
    else if (line.startsWith("-")) { file.del++; file.lines.push({ kind: "del", no: oldNo++, text: line.slice(1) }); }
    else { file.lines.push({ kind: "ctx", no: newNo++, text: line.slice(1) }); oldNo++; }
  }
  return files;
}

const BANNER = {
  success: { box: "bg-emerald-500/10 border-emerald-500/25", dot: "bg-emerald-600", icon: "verified", title: "text-emerald-200", text: "text-emerald-300",
             chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/35", chipText: "CHANGE COMMITTED" },
  failed: { box: "bg-rose-500/10 border-rose-500/25", dot: "bg-rose-600", icon: "cancel", title: "text-rose-200", text: "text-rose-300",
            chip: "bg-rose-500/15 text-rose-300 border-rose-500/35", chipText: "WORKING COPY REVERTED" },
  env_failed: { box: "bg-amber-500/10 border-amber-500/25", dot: "bg-amber-600", icon: "build_circle", title: "text-amber-200", text: "text-amber-300",
                chip: "bg-amber-500/15 text-amber-200 border-amber-500/35", chipText: "RUN HALTED" },
};

function Banner({ run }) {
  const r = run.result;
  const b = BANNER[run.status] || BANNER.failed;
  const feature = r.task_type === "feature";
  const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");

  const title = run.status === "success" ? (feature ? "Feature Added Successfully" : "Repair Completed Successfully")
    : run.status === "env_failed" ? "Environment Setup Failed" : (feature ? "Feature Run Failed" : "Repair Run Failed");
  const text = run.status === "success"
    ? "Done in " + plural(r.attempts, "attempt") + " • " + plural(r.regressions.length, "regression") + " • " + r.after.passed + " of " + r.after.total + " tests passing"
    : run.status === "env_failed" ? "The virtual environment, the dependency install or pytest itself could not run."
    : "No acceptable change after " + plural(r.attempts, "attempt") + ". Nothing was committed.";

  return (
    <div className={"border rounded-xl p-3.5 shadow-2xs " + b.box}>
      <div className="flex items-center gap-3">
        <div data-pop className={"w-9 h-9 rounded-full text-white flex items-center justify-center shrink-0 shadow-xs " + b.dot}>
          <Icon name={b.icon} fill className="text-[20px]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className={"text-sm font-bold " + b.title}>{title}</div>
          <p className={"text-xs mt-0.5 " + b.text}>{text}</p>
        </div>
        <span className={"hidden sm:inline font-mono text-xs px-2.5 py-1 rounded font-semibold border whitespace-nowrap " + b.chip}>{b.chipText}</span>
      </div>
    </div>
  );
}

function TestMatrix({ r }) {
  const gained = r.after.passed - r.baseline.passed;
  const rows = [["Passed", "passed"], ["Failed", "failed"], ["Total Runs", "total"]];
  return (
    <div className={CARD + " md:col-span-7 p-3.5"}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-slate-50">
          <Icon name="fact_check" className="text-[17px] text-emerald-400" />
          <h3 className="font-semibold text-xs">Test Results Matrix</h3>
        </div>
        <span className="font-mono text-[10px] bg-white/[0.06] text-slate-400 px-1.5 py-0.5 rounded border border-white/[0.08]">pytest</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-xs">
          <thead>
            <tr className="bg-white/[0.06] text-slate-400 text-[10px] uppercase tracking-wider">
              <th scope="col" className="py-1 px-2.5 rounded-l">Metric</th>
              <th scope="col" className="py-1 px-2.5">Before</th>
              <th scope="col" className="py-1 px-2.5 rounded-r">After Patch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06] text-slate-300">
            {rows.map(([label, key], i) => (
              <tr key={key} className={i === 1 ? "bg-white/[0.03]" : ""}>
                <th scope="row" className="py-1.5 px-2.5 font-medium">{label}</th>
                <td className={"py-1.5 px-2.5 tabular-nums " + (key === "failed" && r.baseline.failed > 0 ? "text-rose-400 font-semibold" : "text-slate-400")}><CountUp value={r.baseline[key]} /></td>
                <td className={"py-1.5 px-2.5 tabular-nums " + (key === "passed" ? "text-emerald-300 font-bold" : key === "failed" && r.after.failed > 0 ? "text-rose-400 font-bold" : "font-semibold text-slate-200")}>
                  <CountUp value={r.after[key]} />
                  {key === "passed" && <> Passed{gained > 0 && " (+" + gained + ")"}</>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Quality({ run }) {
  const r = run.result;
  const regs = r.regressions;
  // Don't claim a green "0 detected" when the after-run never happened.
  const ran = run.status !== "env_failed" && (r.after.total > 0 || regs.length > 0);
  return (
    <div className="md:col-span-5 flex flex-col gap-2">
      <div className={CARD + " p-3"}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-semibold text-xs text-slate-50">Regressions</div>
            <div className="text-[11px] text-slate-400">Baseline integrity</div>
          </div>
          <span className={"px-2 py-0.5 border font-mono text-xs font-bold rounded-md whitespace-nowrap " +
            (!ran ? "bg-amber-500/10 border-amber-500/25 text-amber-300" : regs.length ? "bg-rose-500/10 border-rose-500/25 text-rose-300" : "bg-emerald-500/10 border-emerald-500/25 text-emerald-300")}>
            {!ran ? "not run" : <>{regs.length ? "✕" : "✓"} <CountUp value={regs.length} /> detected</>}
          </span>
        </div>
        {regs.length > 0 && (
          <ul className="mt-2 space-y-1 font-mono text-[11px] text-rose-300 break-all">{regs.map((t) => <li key={t}>{String(t)}</li>)}</ul>
        )}
      </div>
      <div className={CARD + " p-3 flex flex-col gap-1.5"}>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-xs text-slate-50">New Tests Added</span>
          <span className="font-mono text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 px-1.5 py-0.5 rounded font-medium"><CountUp value={r.new_tests.length} /> added</span>
        </div>
        {r.new_tests.length ? r.new_tests.map((t) => (
          <div key={t} className="flex items-center gap-1.5 p-1.5 rounded bg-white/[0.03] border border-white/[0.08] font-mono text-[11px] text-slate-200">
            <Icon name="check_circle" className="text-[15px] text-emerald-400 shrink-0" />
            <span className="truncate" title={t}>{String(t).split("::").pop()}</span>
          </div>
        )) : <p className="text-[11px] text-slate-400">none</p>}
      </div>
    </div>
  );
}

// `r` only needs a `diff`; the project view reuses this for the cumulative diff.
export function Changes({ r }) {
  const files = useMemo(() => parseDiff(r.diff), [r.diff]);
  const [picked, setPicked] = useState(0);
  const file = files[Math.min(picked, files.length - 1)];
  const code = useRef(null);
  useAnime(code, () => { // the picked file's lines slide in
    const rows = [...code.current.children].slice(0, 40);
    if (rows.length) animate(rows, { opacity: [0, 1], x: [-10, 0], duration: 400, ease: "outExpo", delay: (el, i) => i * 18, onComplete: (a) => utils.cleanInlineStyles(a) });
  }, [picked, r.diff]);
  if (!file) return null;
  const LINE = {
    add: ["bg-emerald-950/60 text-emerald-200 border-l-2 border-emerald-500", "text-emerald-400", "+"],
    del: ["bg-rose-950/60 text-rose-200 border-l-2 border-rose-500", "text-rose-400", "-"],
    ctx: ["text-slate-300 hover:bg-slate-800/50 border-l-2 border-transparent", "opacity-40", " "],
  };
  return (
    <>
      <div className={CARD + " p-3.5"}>
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-xs text-slate-50 flex items-center gap-1.5">
            <Icon name="rule_folder" className="text-[16px] text-slate-400" />
            Files Modified
          </span>
          <span className="font-mono text-[11px] text-slate-400"><CountUp value={files.length} /> {files.length === 1 ? "file" : "files"} changed</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono text-xs">
          {files.map((f, i) => (
            <button key={f.path} type="button" aria-pressed={f === file} onClick={() => setPicked(i)} title={"Show the diff of " + f.path}
                    className={"flex items-center justify-between gap-2 p-2 rounded-lg border text-left transition active:scale-[0.98] " +
                      (f === file ? "bg-blue-500/10 border-blue-500/25" : "bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06]")}>
              <span className="flex items-center gap-1.5 min-w-0">
                <Icon name="description" className={"text-[16px] " + (f === file ? "text-blue-400" : "text-slate-500")} />
                <span className="text-slate-200 font-medium truncate">{f.path}</span>
              </span>
              <span className="flex items-center gap-1 text-[11px] shrink-0">
                <span className="text-emerald-300 font-bold">+{f.add}</span>
                <span className={(f.del ? "text-rose-400" : "text-slate-500") + " font-bold"}>-{f.del}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className={CARD + " overflow-hidden"}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-white/[0.03] border-b border-white/[0.08]">
          <div className="flex items-center gap-2 min-w-0">
            <Icon name="difference" className="text-[17px] text-blue-400" />
            <span className="font-semibold text-xs text-slate-50 whitespace-nowrap">Generated Unified Diff</span>
            <span className="font-mono text-[11px] bg-white/10 text-slate-300 px-1.5 py-0.5 rounded truncate">{file.path}</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 px-2 py-0.5 rounded font-bold">+{file.add} additions</span>
            <span className="bg-rose-500/10 text-rose-300 border border-rose-500/25 px-2 py-0.5 rounded font-bold">-{file.del} removals</span>
          </div>
        </div>
        <div tabIndex="0" aria-label={"Diff of " + file.path} className="overflow-auto max-h-[520px] bg-[#040711]/85 text-slate-100 font-mono text-xs py-3 leading-relaxed">
          <div ref={code} className="w-max min-w-full">
            {file.lines.map((line, i) => {
              if (line.kind === "hunk") return <div key={i} className="text-slate-500 py-0.5 px-3 select-none text-[11px]">{line.text}</div>;
              const [row, mark, sign] = LINE[line.kind];
              return (
                <div key={i} className={"flex items-center py-0.5 px-2 " + row}>
                  <span className={"w-8 text-right select-none mr-3 text-[11px] shrink-0 " + mark}>{line.no}</span>
                  <span className={"w-4 select-none font-bold mr-1 text-center shrink-0 " + mark}>{sign}</span>
                  <code className="whitespace-pre">{line.text || " "}</code>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function Waiting({ run, busy, steps }) {
  const working = busy || !!run;
  const current = steps.find((s) => s.status === "running");
  return (
    <div className={CARD + " p-8 flex flex-col items-center text-center"}>
      <div className="w-24 h-24 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
        <svg className="w-16 h-16 text-blue-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 64 64" aria-hidden="true">
          <rect height="44" rx="3" strokeDasharray="2 2" width="48" x="8" y="10"></rect>
          <path d="M16 20H28M16 26H36M16 32H24" strokeLinecap="round"></path>
          <g className={working ? "scan" : ""}>
            <circle cx="40" cy="40" fill="rgba(59,130,246,0.15)" r="10"></circle>
            <path d="M47 47L55 55" strokeLinecap="round" strokeWidth="2"></path>
            <path d="M37 40H43M40 37V43" strokeLinecap="round"></path>
          </g>
        </svg>
      </div>
      <h3 className="font-semibold text-sm text-slate-50 mt-4">
        {working ? "Agent is working" : "Ready to repair"}
      </h3>
      <p className="text-xs text-slate-400 max-w-xs mt-1 leading-relaxed">
        {working ? (current ? "Current step: " + current.name : "Starting the run…")
          : "Choose a repository, describe the task and press Execute Repair. The result, the test comparison and the diff appear here."}
      </p>
    </div>
  );
}

export default function Results({ run, busy, steps }) {
  const done = finished(run);
  // A run cut off by a crash can have a nearly empty result: fill in what the cards read.
  const r = done ? { attempts: 0, regressions: [], new_tests: [], baseline: {}, after: {}, ...run.result } : null;
  if (r) run = { ...run, result: r };
  const root = useRef(null);
  useAnime(root, () => { // each state's cards arrive one by one; the banner icon springs in
    enter(root.current.children, { delay: (el, i) => i * 90 });
    pop(root.current.querySelectorAll("[data-pop]"), { scale: [0.3, 1], delay: 150 });
  }, [done, run && run.id]);

  return (
    <div ref={root} className="flex flex-col gap-4 min-w-0">
      {!r ? <Waiting run={run} busy={busy} steps={steps} /> : (
        <>
          <Banner run={run} />
          {run.status === "success" && (
            <div className={CARD + " p-4"}>
              <div className="flex items-center gap-1.5 mb-2">
                <Icon name="psychology" className="text-[18px] text-blue-400" />
                <h3 className="font-semibold text-sm text-slate-50">What changed &amp; Root Cause</h3>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.08] rounded-lg p-3 text-slate-300 text-xs leading-relaxed whitespace-pre-wrap break-words">{r.explanation || "(no explanation given)"}</div>
            </div>
          )}
          {r.syntax && (
            <div className={CARD + " p-4"}>
              <h3 className="font-semibold text-sm text-slate-50 mb-2">Syntax repair</h3>
              <ul className="font-mono text-xs text-slate-300 space-y-1 break-words">
                {(r.syntax.files || []).map((f) => <li key={f.path + ":" + f.line}>{f.path} line {f.line}: {f.msg} · {f.after}</li>)}
              </ul>
              {r.syntax.only_syntax && <p className="mt-2 text-xs text-slate-400">Bug reproduced: n/a (syntax repair only). There is no fail-first test for code that did not parse.</p>}
            </div>
          )}
          {r.error && (
            <div className={CARD + " p-4"}>
              <h3 className="font-semibold text-sm text-slate-50 mb-2">{run.status === "env_failed" ? "pip / pytest trace output" : "Failure Diagnostics"}</h3>
              <pre className={"bg-[#040711]/85 border border-white/[0.08] p-3 rounded-lg font-mono text-xs whitespace-pre-wrap break-words overflow-auto max-h-80 leading-relaxed " + (run.status === "env_failed" ? "text-slate-200" : "text-rose-300")}>{r.error}</pre>
            </div>
          )}
          {r.note && (
            <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3.5 text-xs text-amber-200 whitespace-pre-wrap break-words leading-relaxed flex gap-2">
              <Icon name="info" className="text-[16px] text-amber-400 shrink-0" />
              <span className="min-w-0">{r.note}</span>
            </div>
          )}
          {run.status !== "env_failed" && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <TestMatrix r={r} />
              <Quality run={run} />
            </div>
          )}
          {run.status === "success" && <Changes r={r} />}
        </>
      )}
    </div>
  );
}
