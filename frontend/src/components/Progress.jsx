import { useRef } from "react";
import { animate, utils } from "animejs";
import { finished } from "../api.js";
import { enter, pop, useAnime, useChanged } from "../motion.jsx";
import { CARD, Icon } from "./ui.jsx";

const BADGE = {
  standby: ["bg-slate-100 text-slate-600 border-slate-200", "bg-slate-400", "STANDBY"],
  running: ["bg-blue-50 text-blue-700 border-blue-200/60", "bg-blue-600 animate-ping", "RUNNING"],
  awaiting_approval: ["bg-amber-50 text-amber-800 border-amber-200", "bg-amber-500 animate-pulse", "NEEDS ANSWER"],
  success: ["bg-emerald-50 text-emerald-700 border-emerald-200/70", "bg-emerald-600", "SUCCESS"],
  failed: ["bg-rose-50 text-rose-700 border-rose-200", "bg-rose-600", "FAILED"],
  env_failed: ["bg-amber-50 text-amber-800 border-amber-200", "bg-amber-600", "ENV FAULT"],
};

// How one step is drawn. A rejected attempt that was followed by another attempt is a "retry", not a failure.
function look(step, retried) {
  if (step.status === "ok") return { icon: "check_circle", fill: true, tone: "text-emerald-600", box: "bg-slate-50 border-slate-200/70", title: "text-slate-800", text: "text-slate-500" };
  if (step.status === "running") return { ping: true, tone: "text-blue-600", box: "bg-blue-50/80 border-blue-200 shadow-2xs", title: "text-blue-800", text: "text-blue-900", tag: "running", tagTone: "text-blue-600 font-medium" };
  if (step.status === "error" && retried) return { icon: "warning", tone: "text-amber-500", box: "bg-amber-50/60 border-amber-200/80", title: "text-amber-900", text: "text-amber-800/90", tag: "retry", tagTone: "bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium text-[10px]" };
  if (step.status === "error") return { icon: "cancel", fill: true, tone: "text-rose-600", box: "bg-rose-50/70 border-rose-200", title: "text-rose-900", text: "text-rose-800", tag: "failed", tagTone: "bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded font-medium text-[10px]" };
  return { icon: "radio_button_unchecked", tone: "text-slate-300", box: "bg-slate-50/70 border-slate-200/60 opacity-75", title: "text-slate-700", text: "text-slate-500", tag: "pending", tagTone: "text-slate-400" };
}

export default function Progress({ run, busy, steps, elapsed, showApproval, onApprove }) {
  const status = run ? run.status : busy ? "running" : "standby";
  const [badgeClass, dotClass, badgeText] = BADGE[status] || BADGE.standby;
  const reached = steps.reduce((last, s, i) => (s.status === "pending" ? last : i), -1);

  const list = useRef(null);
  const { first, changed, key } = useChanged(steps.map((s) => s.name + s.status));
  useAnime(list, () => {
    const rows = [...list.current.querySelectorAll("[data-step]")];
    if (first) return enter(rows, { y: [10, 0], delay: (el, i) => 200 + i * 45 });
    const moved = changed.map((i) => rows[i]).filter(Boolean); // a step started, passed or failed
    if (!moved.length) return;
    animate(moved, { x: [-12, 0], opacity: [0.2, 1], duration: 500, ease: "outExpo", onComplete: (a) => utils.cleanInlineStyles(a) });
    pop(moved.map((row) => row.querySelector("[data-node]")));
  }, [key]);
  const badge = useRef(null);
  useAnime(badge, () => pop([badge.current], { scale: [0.8, 1] }), [status]);
  const question = useRef(null);
  useAnime(question, () => enter([question.current]), [showApproval]);

  return (
    <div className="lg:col-span-4 flex flex-col gap-4">
      <section className={CARD + " p-4"}>
        <div className="flex items-center justify-between gap-2 mb-4 pb-2 border-b border-slate-100">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-sm text-slate-900">Run Progress</h2>
              {run && <span className="fade-in font-mono text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200/70">#{run.id}</span>}
            </div>
            <span className="text-[11px] text-slate-500">
              Baseline tests, change, verify{elapsed !== null && <span className="font-mono tabular-nums"> · {elapsed.toFixed(1)}s</span>}
            </span>
          </div>
          <div ref={badge} role="status" className={"flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-[11px] font-semibold whitespace-nowrap " + badgeClass}>
            <span className={"w-2 h-2 rounded-full " + dotClass}></span>
            <span>{badgeText}</span>
          </div>
        </div>

        {showApproval && (
          <div ref={question} role="alert" className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-xs text-amber-950 whitespace-pre-wrap break-words leading-relaxed">{run.approval.question}</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {run.approval.options.map((o) => (
                <button key={o.id} type="button" onClick={() => onApprove(o.id)}
                        className="px-2.5 py-1.5 rounded-md bg-white border border-amber-200 hover:bg-amber-100/60 active:scale-[0.99] text-xs font-medium text-slate-800 text-left transition">
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={list} className="relative pl-6">
          {/* spine: the blue part grows as steps are reached */}
          <div className="absolute left-[11px] top-2 bottom-3 w-[2px] bg-slate-200">
            <div className="spine-fill w-full h-full bg-blue-500 origin-top"
                 style={{ transform: `scaleY(${steps.length > 1 ? Math.max(reached, 0) / (steps.length - 1) : 0})` }}></div>
          </div>
          <ol className="space-y-3">
            {steps.map((s, i) => {
              const retried = !finished(run) || steps.slice(i + 1).some((later) => later.status !== "pending");
              const v = look(s, retried);
              return (
                <li key={i} data-step className="relative flex items-start gap-2.5" aria-current={s.status === "running" ? "step" : undefined}>
                  <span data-node className={"absolute -left-6 top-0.5 w-[22px] h-[22px] rounded-full bg-white flex items-center justify-center " + v.tone}>
                    {v.ping ? <span className="w-3.5 h-3.5 rounded-full bg-blue-600 animate-ping"></span> : <Icon name={v.icon} fill={v.fill} className="text-[18px]" />}
                  </span>
                  <div className={"flex-1 min-w-0 border p-2.5 rounded-lg transition-colors duration-300 " + v.box}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={"font-mono text-xs font-semibold " + v.title}>
                        {i + 1}. {s.name}<span className="sr-only"> ({s.status})</span>
                      </span>
                      {v.tag && <span className={"font-mono text-[11px] shrink-0 " + v.tagTone}>{v.tag}</span>}
                    </div>
                    {s.detail && <p className={"font-mono text-[11px] mt-0.5 break-words " + v.text}>{s.detail}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>
    </div>
  );
}
