// Theme from stitch_codefix_agent_workspace (DESIGN.md, "Obsidian Kinetic"); class names unchanged from the earlier design.
// Only difference: font stacks name the npm-bundled fonts ("Geist Variable") and add fallbacks.
const sans = ["Geist Variable", "Geist", "system-ui", "sans-serif"];
const mono = ["JetBrains Mono", "ui-monospace", "Consolas", "monospace"];

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: { // Obsidian Kinetic tokens (stitch_codefix_agent_workspace/DESIGN.md)
        "surface": "#0f131c", "surface-dim": "#0f131c", "surface-bright": "#353943",
        "surface-container-lowest": "#0a0e17", "surface-container-low": "#181b25", "surface-container": "#1c1f29",
        "surface-container-high": "#262a34", "surface-container-highest": "#31353f", "surface-variant": "#31353f",
        "on-surface": "#dfe2ef", "on-surface-variant": "#c2c6d6", "inverse-surface": "#dfe2ef", "inverse-on-surface": "#2c303a",
        "outline": "#8c909f", "outline-variant": "#424754", "surface-tint": "#adc6ff", "background": "#040711", "on-background": "#dfe2ef",
        "primary": "#adc6ff", "on-primary": "#002e6a", "primary-container": "#4d8eff", "on-primary-container": "#00285d", "inverse-primary": "#005ac2",
        "secondary": "#4cd7f6", "on-secondary": "#003640", "secondary-container": "#03b5d3", "on-secondary-container": "#00424e",
        "tertiary": "#4edea3", "on-tertiary": "#003824", "tertiary-container": "#00a572", "on-tertiary-container": "#00311f",
        "error": "#ffb4ab", "on-error": "#690005", "error-container": "#93000a", "on-error-container": "#ffdad6",
        "success": "#10b981", "success-container": "rgba(16,185,129,0.12)", "success-outline": "rgba(16,185,129,0.25)",
        "warning": "#f59e0b", "warning-container": "rgba(245,158,11,0.12)", "warning-outline": "rgba(245,158,11,0.25)",
      },
      borderRadius: { DEFAULT: "0.25rem", lg: "0.5rem", xl: "0.75rem", full: "9999px" },
      spacing: {
        "gutter-desktop": "1.5rem", "space-2xl": "2rem", "margin-desktop": "2rem", "space-md": "0.75rem",
        "space-lg": "1rem", "space-sm": "0.5rem", "space-xl": "1.5rem", "space-2xs": "0.125rem", "gutter": "1rem",
        "margin": "1rem", "space-xs": "0.25rem",
      },
      // login page (stitch_codefix_loginpage)
      boxShadow: {
        "soft-card": "0 4px 6px -1px rgba(15, 23, 42, 0.03), 0 20px 25px -5px rgba(15, 23, 42, 0.05), 0 0 0 1px rgba(226, 232, 240, 0.8)",
        "btn-subtle": "0 2px 4px rgba(37, 99, 235, 0.16), 0 8px 16px -4px rgba(37, 99, 235, 0.28)",
        "btn-hover": "0 4px 12px rgba(29, 78, 216, 0.25), 0 12px 24px -4px rgba(29, 78, 216, 0.35)",
        // console (stitch_code_fix.zip) uses these two names
        xs: "0 1px 2px 0 rgba(15, 23, 42, 0.05)", "2xs": "0 1px 1px 0 rgba(15, 23, 42, 0.04)",
      },
      fontFamily: {
        headline: sans,
        login: ["Inter Variable", "Inter", "system-ui", "sans-serif"], mono,
        "headline-md": sans, "headline-xl": sans, "headline-sm": sans, "body-sm": sans, "body-md": sans,
        "headline-lg-mobile": sans, "headline-xl-mobile": sans, "body-lg": sans, "headline-lg": sans,
        "label-sm": sans, "label-md": sans, "code-sm": mono, "code-md": mono, "code-xs": mono,
      },
      fontSize: {
        "headline-md": ["18px", { lineHeight: "26px", letterSpacing: "-0.015em", fontWeight: "600" }],
        "headline-xl": ["32px", { lineHeight: "40px", letterSpacing: "-0.025em", fontWeight: "600" }],
        "headline-sm": ["15px", { lineHeight: "22px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "body-sm": ["12px", { lineHeight: "18px", fontWeight: "400" }],
        "body-md": ["13px", { lineHeight: "20px", fontWeight: "400" }],
        "headline-lg-mobile": ["20px", { lineHeight: "28px", letterSpacing: "-0.015em", fontWeight: "600" }],
        "headline-xl-mobile": ["26px", { lineHeight: "34px", letterSpacing: "-0.02em", fontWeight: "600" }],
        "code-sm": ["12px", { lineHeight: "18px", fontWeight: "400" }],
        "body-lg": ["15px", { lineHeight: "24px", fontWeight: "400" }],
        "headline-lg": ["24px", { lineHeight: "32px", letterSpacing: "-0.02em", fontWeight: "600" }],
        "label-sm": ["11px", { lineHeight: "16px", letterSpacing: "0.02em", fontWeight: "500" }],
        "label-md": ["13px", { lineHeight: "18px", fontWeight: "500" }],
        "code-md": ["13px", { lineHeight: "20px", fontWeight: "400" }],
        "code-xs": ["11px", { lineHeight: "16px", fontWeight: "400" }],
      },
    },
  },
};
