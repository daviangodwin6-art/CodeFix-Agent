import { useRef } from "react";
import { animate, utils } from "animejs";
import { finished } from "../api.js";
import { enter, pop, useAnime, useChanged } from "../motion.jsx";
import { CARD, duration, Icon, plural, short } from "./ui.jsx";

const BADGE = {
  standby: ["bg-slate-100 text-slate-600 border-slate-200", "STANDBY"],
  running: ["bg-blue-50 text-blue-700 border-blue-200", "RUNNING"],
  success: ["bg-emerald-50 text-emerald-700 border-emerald-200", "SUCCESS"],
  failed: ["bg-rose-50 text-rose-700 border-rose-200", "FAILED"],
  env_failed: ["bg-amber-50 text-amber-800 border-amber-200", "ENV FAULT"],
};

const envReused = (step) => step.name === "environment" && step.status === "ok" && /reused/i.test(step.detail || "");

// How one step is drawn. A rejected attempt that was followed by another attempt is a "retry", not a failure.
function look(step, retried) {
  if (envReused(step)) return { icon: "check", box: "bg-emerald-50 border-emerald-200", title: "text-slate-800", side: "text-emerald-700 font-medium" };
  if (step.status === "ok") return { icon: "check", box: "bg-white border-slate-200", title: "text-slate-800", side: "text-slate-500" };
  if (step.status === "running") return { dot: "bg-blue-600", box: "bg-white border-blue-500 ring-1 ring-blue-500/25", title: "text-blue-700", side: "text-blue-600", tag: "running…" };
  if (step.status === "error" && retried) return { icon: "warning", box: "bg-amber-50/60 border-amber-200", title: "text-amber-900", side: "text-amber-800", tag: "retry" };
  if (step.status === "error") return { icon: "close", box: "bg-rose-50/70 border-rose-200", title: "text-rose-900", side: "text-rose-800", tag: "failed" };
  return { dot: "border border-slate-400", box: "bg-white border-slate-200", title: "text-slate-500", side: "text-slate-400", tag: "pending" };
}

const clock = (seconds) => Math.floor(seconds / 60) + ":" + String(Math.floor(seconds) % 60).padStart(2, "0");

export default function Progress({ run, busy, steps, elapsed, head, className = "" }) {
  const status = run ? run.status : busy ? "running" : "standby";
  const [badgeClass, badgeText] = BADGE[status] || BADGE.standby;

  const list = useRef(null);
  const { first, changed, key } = useChanged(steps.map((s) => s.name + s.status));
  useAnime(list, () => {
    const rows = [...list.current.children];
    if (first) return enter(rows, { y: [10, 0], delay: (el, i) => 200 + i * 45 });
    const moved = changed.map((i) => rows[i]).filter(Boolean); // a step started, passed or failed
    if (!moved.length) return;
    animate(moved, { x: [-12, 0], opacity: [0.2, 1], duration: 500, ease: "outExpo", onComplete: (a) => utils.cleanInlineStyles(a) });
    pop(moved.map((row) => row.querySelector("[data-node]")));
  }, [key]);
  const badge = useRef(null);
  useAnime(badge, () => pop([badge.current], { scale: [0.8, 1] }), [status]);

  return (
    <section aria-labelledby="progress-title" className={CARD + " p-[25px] min-w-0 " + className}>
      <div className="flex items-start justify-between gap-3 pb-2.5 mb-3 border-b border-slate-200">
        <div className="min-w-0">
          <h2 id="progress-title" className="font-semibold text-[17.5px] text-slate-900">Run Progress</h2>
          <p className="text-[13.5px] text-slate-500 truncate">
            {[run && run.id, head ? "continuing from head " + short(head) : "Baseline tests, change, verify"].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div ref={badge} role="status" className={"mt-1 px-3 py-1 rounded-full border font-mono text-[12.5px] whitespace-nowrap tabular-nums " + badgeClass}>
          {badgeText}{elapsed !== null && " · " + clock(elapsed)}
        </div>
      </div>

      <ol ref={list} className="flex flex-col gap-[11px]">
        {steps.map((s, i) => {
          const retried = !finished(run) || steps.slice(i + 1).some((later) => later.status !== "pending");
          const v = look(s, retried);
          const detail = s.detail || "";
          const inline = s.status === "ok" && detail.length <= 24; // short details sit on the right, long ones wrap below
          const side = v.tag || [inline && detail, duration(s.duration_s)].filter(Boolean).join(" · ");
          return (
            <li key={i} aria-current={s.status === "running" ? "step" : undefined}
                className={"border rounded-lg px-4 py-[9px] transition-colors duration-300 " + v.box}>
              <div className="flex items-center justify-between gap-3">
                <span className={"flex items-center gap-2.5 shrink-0 font-mono text-[14.5px] " + v.title}>
                  <span data-node className="w-4 flex justify-center shrink-0">
                    {v.icon ? <Icon name={v.icon} className="text-[17px]" /> : <span className={"w-[7px] h-[7px] rounded-full " + v.dot}></span>}
                  </span>
                  <span className="whitespace-nowrap">{i + 1}. {s.name}<span className="sr-only"> ({s.status})</span></span>
                </span>
                <span className={"font-mono text-[12.5px] min-w-0 truncate " + v.side}>{side}</span>
              </div>
              {detail && !inline && <p className={"font-mono text-[12.5px] mt-1 pl-[26px] break-words " + v.side}>{detail}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// Right column of a live run: what the project already holds, and what happens if the run fails.
export function BuildsOn({ project: p, run }) {
  const result = (run && run.result) || {};
  const head = result.head_before || (p && p.head_sha);
  const wins = p && p.runs ? p.runs.filter((r) => r.status === "success").length : null;
  const envStep = ((run && run.steps) || []).find((s) => s.name === "environment" && (s.status === "ok" || s.status === "error"));
  const env = result.env_status
    ? [result.env_status, result.env_reason || (result.env_status === "reused" ? "deps unchanged" : "")].filter(Boolean).join(" · ")
    : envStep ? envStep.detail : "";
  const rows = [
    ["Project head", [short(head), p && p.branch].filter(Boolean).join(" · ")],
    ["Earlier changes kept", p ? plural(p.changes_ahead_of_base, "commit") + (wins === null ? "" : " from " + plural(wins, "successful run")) : ""],
    ["Locked tests", p && p.locked_tests ? p.locked_tests.total + " (" + p.locked_tests.added_by_runs + " added by earlier runs)" : ""],
    ["Environment", env || "checking…", /reused/i.test(env) ? "text-emerald-700" : env ? "text-slate-900" : "text-slate-500"],
  ];
  return (
    <section aria-labelledby="builds-title" className={CARD + " p-[25px] min-w-0"}>
      <h2 id="builds-title" className="font-semibold text-[17.5px] text-slate-900">What this run builds on</h2>
      <dl className="mt-4 flex flex-col gap-4">
        {rows.map(([label, value, tone]) => (
          <div key={label}>
            <dt className="text-[13.5px] text-slate-500">{label}</dt>
            <dd className={"mt-1 font-mono text-[14.5px] break-words " + (tone || "text-slate-900")}>{value || "…"}</dd>
          </div>
        ))}
      </dl>
      {head && (
        <p className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-[13.5px] text-slate-700 leading-relaxed">
          If this run fails, the project goes back to {short(head)}. Nothing half-applied is kept.
        </p>
      )}
    </section>
  );
}
