import { useEffect, useRef } from "react";

export function Icon({ name, className = "", fill = false }) {
  return (
    <span aria-hidden="true" className={"material-symbols-outlined " + className}
          style={fill ? { fontVariationSettings: "'FILL' 1" } : undefined}>{name}</span>
  );
}

export const CARD = "bg-white rounded-xl border border-slate-200 shadow-xs";
export const BUTTON = "h-[42px] px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:scale-[0.98] text-[14.5px] font-medium text-slate-800 whitespace-nowrap transition disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100";
export const PRIMARY = "h-[42px] px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-[14.5px] font-semibold text-white whitespace-nowrap shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100";

export function Copy({ text }) {
  return (
    <button type="button" onClick={() => navigator.clipboard && navigator.clipboard.writeText(text)}
            className="text-blue-600 hover:text-blue-700 active:scale-95 transition font-semibold text-xs ml-2 flex-shrink-0">
      Copy
    </button>
  );
}

export const short = (sha) => String(sha || "").slice(0, 7);
export const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");

// 0.4s, 58s, 2m 05s
export function duration(seconds) {
  if (seconds == null) return "";
  if (seconds < 10) return Number(seconds).toFixed(1) + "s";
  const whole = Math.round(seconds);
  return whole < 60 ? whole + "s" : Math.floor(whole / 60) + "m " + String(whole % 60).padStart(2, "0") + "s";
}

// ISO timestamp -> "2 min ago", "yesterday"
export function ago(iso) {
  const min = (Date.now() - Date.parse(iso)) / 60000;
  if (!(min >= 0)) return "";
  if (min < 1) return "just now";
  if (min < 60) return Math.floor(min) + " min ago";
  if (min < 1440) return Math.floor(min / 60) + " h ago";
  if (min < 2880) return "yesterday";
  return new Date(iso).toLocaleDateString();
}

// Project kinds: badge text, the Repository selector mode each one maps to, badge colours.
export const KIND = {
  mine: { label: "My repo", mode: "own", tone: "text-blue-700 border-blue-200 bg-blue-50/40" },
  others: { label: "Other's", mode: "other", tone: "text-orange-700 border-orange-200 bg-orange-50/40" },
  local: { label: "Local", mode: "local", tone: "text-slate-600 border-slate-300 bg-white" },
};

export function KindBadge({ kind }) {
  const k = KIND[kind] || KIND.local;
  return <span className={"font-mono text-[10.5px] leading-4 uppercase tracking-wide px-1.5 rounded border shrink-0 " + k.tone}>{k.label}</span>;
}

// Modal on the native <dialog>: the browser traps focus, closes on Escape and returns focus to the opener.
// `children` is a function that receives `close`.
export function Dialog({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
    const first = ref.current.querySelector("[data-autofocus]"); // otherwise the browser picks the first control
    if (first) first.focus();
  }, []);
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="dialog-title"
            className="fade-in w-[600px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-8 text-left text-slate-900 shadow-2xl backdrop:bg-slate-900/45">
      <h2 id="dialog-title" className="font-semibold text-[20px] tracking-tight break-words">{title}</h2>
      {children(() => ref.current.close())}
    </dialog>
  );
}
