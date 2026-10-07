// Theme copied from stitch_codefix_agent_developer_console/code.html so the design's class names work unchanged.
// Only difference: font stacks name the npm-bundled fonts ("Geist Variable") and add fallbacks.
const sans = ["Geist Variable", "Geist", "system-ui", "sans-serif"];
const mono = ["JetBrains Mono", "ui-monospace", "Consolas", "monospace"];

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        "on-error": "#ffffff", "on-tertiary-container": "#ffede6", "outline": "#737686", "surface-tint": "#0053db",
        "surface-container-highest": "#d9e2fc", "primary-fixed": "#dbe1ff", "error": "#ba1a1a",
        "on-primary-fixed": "#00174b", "on-error-container": "#93000a", "background": "#f9f9ff",
        "on-background": "#121b2e", "on-surface-variant": "#434655", "outline-variant": "#c3c6d7",
        "on-primary-container": "#eeefff", "secondary": "#505f76", "on-tertiary-fixed-variant": "#7d2d00",
        "surface-dim": "#d1daf4", "primary-fixed-dim": "#b4c5ff", "surface": "#f9f9ff", "on-secondary": "#ffffff",
        "on-secondary-container": "#54647a", "primary": "#004ac6", "tertiary-fixed": "#ffdbcd",
        "secondary-fixed": "#d3e4fe", "on-tertiary": "#ffffff", "surface-variant": "#d9e2fc",
        "surface-bright": "#f9f9ff", "surface-container-low": "#f1f3ff", "on-secondary-fixed-variant": "#38485d",
        "inverse-surface": "#273044", "tertiary-fixed-dim": "#ffb596", "secondary-fixed-dim": "#b7c8e1",
        "inverse-on-surface": "#edf0ff", "on-secondary-fixed": "#0b1c30", "surface-container-lowest": "#ffffff",
        "tertiary-container": "#bc4800", "on-tertiary-fixed": "#360f00", "tertiary": "#943700",
        "on-primary-fixed-variant": "#003ea8", "inverse-primary": "#b4c5ff", "surface-container-high": "#e1e8ff",
        "secondary-container": "#d0e1fb", "surface-container": "#e9edff", "on-surface": "#121b2e",
        "on-primary": "#ffffff", "primary-container": "#2563eb", "error-container": "#ffdad6",
        // semantic status colours from DESIGN.md (success / warning are not in the Stitch token set)
        "success": "#16a34a", "success-container": "#f0fdf4", "success-outline": "#bbf7d0",
        "warning": "#d97706", "warning-container": "#fffbeb", "warning-outline": "#fde68a",
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
