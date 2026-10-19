// Tokens: see UI_SPEC.md section 2 (HUD). Dark only; angular shapes (rounded-sm controls, rounded panels); glows via boxShadow tokens.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#07090D", surface: "#10151D", raised: "#171F2A",
        line: "#303B49", "line-strong": "#5A6779",
        ink: "#F2F5F8", "ink-2": "#A0ADBC", "ink-3": "#8D9AAB",
        accent: "#D61F24", "accent-hover": "#E62429", reactor: "#FF454A", "accent-fg": "#63DDF5",
        gold: "#F5B942",
        ok: "#55E6A5", warn: "#FFB84D", bad: "#FF8588",
      },
      fontFamily: {
        sans: ["Geist Variable", "Geist", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "Consolas", "monospace"],
        display: ["Space Grotesk Variable", "Space Grotesk", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "glow-red": "0 0 18px rgba(255,69,74,0.45)",
        "glow-cyan": "0 0 12px rgba(99,221,245,0.3)",
        "inner-cyan": "inset 0 0 8px rgba(99,221,245,0.2)",
        aura: "inset 0 0 0 1px rgba(255,255,255,0.05), 0 0 12px rgba(99,221,245,0.15)",
      },
    },
  },
};
