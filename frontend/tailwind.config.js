// Tokens: see UI_SPEC.md section 2. Dark only, solid surfaces; Tailwind default type scale and radii.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#0b0f17", surface: "#121826", raised: "#1a2233",
        line: "#253049", "line-strong": "#33405c",
        ink: "#e6eaf2", "ink-2": "#b4bccb", "ink-3": "#8a94a8",
        accent: "#2f6fe4", "accent-hover": "#3d7cf0", "accent-fg": "#8ab4ff",
        ok: "#34d399", warn: "#fbbf24", bad: "#f87171",
      },
      fontFamily: {
        sans: ["Geist Variable", "Geist", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "Consolas", "monospace"],
      },
    },
  },
};
