import { useEffect, useRef, useState } from "react";

export function Icon({ name, className = "", fill = false }) {
  return (
    <span aria-hidden="true" className={"material-symbols-outlined " + className}
          style={fill ? { fontVariationSettings: "'FILL' 1" } : undefined}>{name}</span>
  );
}

export const CARD = "rounded-xl border border-line bg-surface";

const BTN_BASE = "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const BTN_VARIANT = {
  primary: "bg-accent hover:bg-accent-hover text-white",
  secondary: "bg-raised border border-line-strong text-ink hover:border-ink-3",
  ghost: "text-ink-2 hover:bg-raised hover:text-ink",
  danger: "border border-bad/40 text-bad hover:bg-bad/10",
};
const BTN_SIZE = { sm: "h-8 px-2.5 text-[13px]", md: "h-9 px-3.5 text-sm", lg: "h-11 px-5 text-[15px]" };
export const button = (variant = "secondary", size = "md") => [BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size]].join(" ");

export const FIELD = "w-full rounded-md bg-raised border border-line-strong text-ink text-sm px-3 py-2 placeholder:text-ink-3 focus:border-accent-fg focus:outline-none focus:ring-1 focus:ring-accent-fg disabled:opacity-60 read-only:opacity-80";

export function Spinner({ className = "" }) {
  return <Icon name="progress_activity" className={"animate-spin " + className} />;
}

export function Skeleton({ className = "" }) {
  return <div aria-hidden="true" className={"skeleton rounded bg-raised " + className} />;
}

export function Copy({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1500);
    return () => clearTimeout(t);
  }, [done]);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setDone(true); } catch (e) { /* clipboard unavailable */ }
  }
  return (
    <button type="button" onClick={copy} className={button("ghost", "sm") + " shrink-0"}>
      <Icon name={done ? "check" : "content_copy"} className="text-base" />
      <span aria-live="polite">{done ? "Copied" : label}</span>
    </button>
  );
}

const TONES = {
  info: { icon: "info", cls: "border-accent-fg/30 bg-accent-fg/10", fg: "text-accent-fg" },
  ok: { icon: "check_circle", cls: "border-ok/30 bg-ok/10", fg: "text-ok" },
  warn: { icon: "warning", cls: "border-warn/30 bg-warn/10", fg: "text-warn" },
  bad: { icon: "error", cls: "border-bad/30 bg-bad/10", fg: "text-bad" },
};

export function Notice({ tone = "info", title, children, onDismiss, className = "" }) {
  const t = TONES[tone] || TONES.info;
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={"flex items-start gap-3 rounded-lg border px-4 py-3 text-sm text-ink " + t.cls + " " + className}>
      <Icon name={t.icon} fill className={"text-xl shrink-0 " + t.fg} />
      <div className="min-w-0 flex-1 break-words">
        {title && <p className={"font-semibold " + t.fg}>{title}</p>}
        {children}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 rounded text-ink-2 hover:text-ink">
          <Icon name="close" className="text-xl" />
        </button>
      )}
    </div>
  );
}

const STATUS = {
  success: { label: "Succeeded", icon: "check_circle", cls: "text-ok border-ok/30 bg-ok/10" },
  failed: { label: "Failed", icon: "cancel", cls: "text-bad border-bad/30 bg-bad/10" },
  env_failed: { label: "Env failed", icon: "warning", cls: "text-warn border-warn/30 bg-warn/10" },
  running: { label: "Running", icon: null, cls: "text-accent-fg border-accent-fg/30 bg-accent-fg/10" },
};
export function StatusPill({ status }) {
  const s = STATUS[status] || { label: "Not started", icon: "circle", cls: "text-ink-2 border-line-strong bg-raised" };
  return (
    <span className={"inline-flex items-center gap-1 rounded-full border px-2 h-6 text-xs font-medium whitespace-nowrap " + s.cls}>
      {s.icon ? <Icon name={s.icon} fill className="text-sm" /> : <Spinner className="text-sm" />}
      {s.label}
    </span>
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
  mine: { label: "My repo", mode: "own", tone: "text-accent-fg border-accent-fg/30 bg-accent-fg/10" },
  others: { label: "Other's", mode: "other", tone: "text-warn border-warn/30 bg-warn/10" },
  local: { label: "Local", mode: "local", tone: "text-ink-2 border-line-strong bg-raised" },
};

export function KindBadge({ kind }) {
  const k = KIND[kind] || KIND.local;
  return <span className={"font-mono text-xs uppercase tracking-wide px-1.5 rounded border shrink-0 " + k.tone}>{k.label}</span>;
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
            className="fade-in w-[560px] max-w-[calc(100vw-2rem)] bg-raised border border-line rounded-xl p-6 text-left text-ink backdrop:bg-black/60">
      <h2 id="dialog-title" className="text-lg font-semibold tracking-tight break-words">{title}</h2>
      {children(() => ref.current.close())}
    </dialog>
  );
}

export function ConfirmDialog({ title, children, confirmLabel = "Confirm", danger = false, onConfirm, onClose }) {
  return (
    <Dialog title={title} onClose={onClose}>
      {(close) => (
        <>
          <div className="mt-3 text-sm text-ink-2 space-y-2">{children}</div>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" data-autofocus onClick={close} className={button("secondary")}>Cancel</button>
            <button type="button" onClick={() => { onConfirm(); close(); }} className={button(danger ? "danger" : "primary")}>{confirmLabel}</button>
          </div>
        </>
      )}
    </Dialog>
  );
}
