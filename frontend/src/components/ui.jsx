export function Icon({ name, className = "", fill = false }) {
  return (
    <span aria-hidden="true" className={"material-symbols-outlined " + className}
          style={fill ? { fontVariationSettings: "'FILL' 1" } : undefined}>{name}</span>
  );
}

export const CARD = "bg-white rounded-xl border border-slate-200 shadow-xs";

export function Copy({ text }) {
  return (
    <button type="button" onClick={() => navigator.clipboard && navigator.clipboard.writeText(text)}
            className="text-blue-600 hover:text-blue-700 active:scale-95 transition font-semibold text-xs ml-2 flex-shrink-0">
      Copy
    </button>
  );
}
