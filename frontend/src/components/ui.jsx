import { useEffect, useRef } from "react";

export function Icon({ name, className = "", fill = false }) {
  return (
    <span aria-hidden="true" className={"material-symbols-outlined " + className}
          style={fill ? { fontVariationSettings: "'FILL' 1" } : undefined}>{name}</span>
  );
}

export const CARD = "glass rounded-xl";
export const BUTTON = "h-[42px] px-3.5 rounded-lg border border-white/[0.14] bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 active:scale-[0.98] text-[14.5px] font-medium text-slate-200 whitespace-nowrap transition disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100";
export const PRIMARY = "h-[42px] px-3.5 rounded-lg sheen bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 active:scale-[0.98] text-[14.5px] font-semibold text-white whitespace-nowrap shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_20px_-6px_rgba(59,130,246,0.7)] transition disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100";

export function Copy({ text }) {
  return (
    <button type="button" onClick={() => navigator.clipboard && navigator.clipboard.writeText(text)}
            className="text-blue-400 hover:text-blue-300 active:scale-95 transition font-semibold text-xs ml-2 flex-shrink-0">
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
  mine: { label: "My repo", mode: "own", tone: "text-blue-300 border-blue-500/25 bg-blue-500/10" },
  others: { label: "Other's", mode: "other", tone: "text-orange-300 border-orange-500/25 bg-orange-500/10" },
  local: { label: "Local", mode: "local", tone: "text-slate-400 border-white/[0.14] bg-white/[0.04]" },
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
            className="fade-in w-[600px] max-w-[calc(100vw-2rem)] glass-raised rounded-2xl p-8 text-left text-slate-50 backdrop:bg-[#040711]/70 backdrop:backdrop-blur-sm">
      <h2 id="dialog-title" className="font-semibold text-[20px] tracking-tight break-words">{title}</h2>
      {children(() => ref.current.close())}
    </dialog>
  );
}
