---
name: Stark HUD Precision Engineering
colors:
  surface: '#0f141c'
  surface-dim: '#0f141c'
  surface-bright: '#343942'
  surface-container-lowest: '#090e16'
  surface-container-low: '#171c24'
  surface-container: '#1b2028'
  surface-container-high: '#252a33'
  surface-container-highest: '#30353e'
  on-surface: '#dee2ee'
  on-surface-variant: '#e7bdb8'
  inverse-surface: '#dee2ee'
  inverse-on-surface: '#2c3139'
  outline: '#ad8884'
  outline-variant: '#5d3f3c'
  surface-tint: '#ffb4ac'
  primary: '#ffb4ac'
  on-primary: '#690007'
  primary-container: '#e62429'
  on-primary-container: '#ffffff'
  inverse-primary: '#c00016'
  secondary: '#f9bc45'
  on-secondary: '#422d00'
  secondary-container: '#bc8708'
  on-secondary-container: '#392600'
  tertiary: '#5bd6ee'
  on-tertiary: '#00363f'
  tertiary-container: '#008294'
  on-tertiary-container: '#ffffff'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdad6'
  primary-fixed-dim: '#ffb4ac'
  on-primary-fixed: '#410003'
  on-primary-fixed-variant: '#93000e'
  secondary-fixed: '#ffdea8'
  secondary-fixed-dim: '#f9bc45'
  on-secondary-fixed: '#271900'
  on-secondary-fixed-variant: '#5e4200'
  tertiary-fixed: '#a4eeff'
  tertiary-fixed-dim: '#5bd6ee'
  on-tertiary-fixed: '#001f25'
  on-tertiary-fixed-variant: '#004e5a'
  background: '#0f141c'
  on-background: '#dee2ee'
  surface-variant: '#30353e'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: '0'
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: '0'
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: 0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: '0'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  code-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 22px
    letterSpacing: -0.01em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: '0'
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.08em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 9px
    fontWeight: '600'
    lineHeight: 12px
    letterSpacing: 0.12em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system models an ultra-high-performance AI engineering HUD inspired by bleeding-edge aerospace diagnostics and holographic heads-up displays. Built for autonomous coding agents and deep-system remediation, it marries the aggressive luxury of Stark Industries metallurgy with the tactical clarity of an operational flight deck. 

The aesthetic is precision-technical minimalism infused with tactile HUD elements: calibrated reticles, razor-thin borders, contextual data telemetry, and glowing plasma accents set against deep space-black armor plating. It rejects decorative clutter in favor of pure information density, absolute legibility, and high-contrast diagnostic feedback. 

Visual interactions must feel alive, instantaneous, and computational—conveying cold precision, relentless compute speed, and sovereign engineering command.

## Colors

The palette establishes an immediate optical hierarchy anchored in deep cosmic darks and vibrant, photon-rich diagnostic primaries:

- **Primary (`#E62429` Armor Red) & Focus (`#FF454A` Reactor Red):** Reserved for primary agent execution, critical diff overrides, active reactor states, and primary call-to-actions.
- **Secondary (`#F5B942` Stark Gold) & Accent (`#FFD77A` Holographic Gold):** Used for structural badges, telemetry highlights, active execution traces, and elevated luxury-grade engineering alerts.
- **Tertiary (`#63DDF5` Holographic Cyan):** Applied to real-time AI telemetry, thread streams, diagnostic vectors, and holographic projection matrices.
- **Diagnostics (`#55E6A5` Arc Green, `#FFB84D` Amber Alert):** Strict functional utility for green builds, verified security checks, and pending regression warnings.
- **Surfaces & Borders:** Obsidian Black (`#07090D`) acts as the deep canvas floor, layered with Deep Armor (`#10151D`) and Gunmetal (`#171F2A`), bounded by structural Dark Titanium lines (`#303B49`).
- **Typography:** Titanium White (`#F2F5F8`) drives primary code blocks and labels, supported by Steel Grey (`#A0ADBC`) for contextual metadata.

## Typography

The type scale combines technical geometric display lettering with industrial monospace metrics and ergonomic UI legibility:

- **Headlines (`Space Grotesk`):** Engineered for sharp architectural weight. Always rendered in high-contrast Titanium White or Stark Gold for key module titles.
- **Body (`Inter`):** Clean, neutral, and devoid of optical fatigue during prolonged remediation runs. Used for patch narratives, user instructions, and agent reasoning logs.
- **Technical & Telemetry (`JetBrains Mono`):** Applied to diff line numbers, SHA hashes, CPU/memory counters, memory coordinates, and micro-labels. All `label-*` tiers enforce uppercase tracking (`letter-spacing: 0.08em` to `0.12em`) to mirror avionics instrumentation readouts.

## Layout & Spacing

The layout is built upon a high-density, multi-pane workbench utilizing a strict 12-column grid on desktop and an adaptive modular stack across smaller viewports:

- **Desktop (1440px+):** Tri-pane diagnostic architecture (Agent Thought Console, Center Diff Canvas, Right-side Telemetry Stack) with `1.5rem` gutters and `2rem` outer chassis margins.
- **Tablet (768px - 1439px):** Split-view collapsible workbench. Telemetry docks into an off-canvas drawer or collapsible bottom shelf. Gutters scale down to `1rem`.
- **Mobile (< 768px):** Single-column stacked stream. Gutter reduces to `0.75rem` and outer chassis margins to `1rem`. Monospace telemetry transitions to horizontal ribbon carousels.

Spacing adheres strictly to 4px/8px multiples, maintaining mathematical rhythm across data grids, inline code diagnostics, and peripheral tool docks.

## Elevation & Depth

Depth is modeled not through muddy drop shadows, but through luminous surface tiering, translucent glass shielding, and optical laser glows:

- **Ground (Canvas):** Base background `#07090D` (Obsidian Black) overlaid with faint, razor-thin technical alignment grids (`rgba(48, 59, 73, 0.25)` at 32px intervals).
- **Surface Level 1 (Panels & Docks):** `#10151D` (Deep Armor) with a 1px solid perimeter of `#303B49` (Dark Titanium) and top-edge light leaks (`linear-gradient(90deg, transparent, rgba(99, 221, 245, 0.2), transparent)`).
- **Surface Level 2 (Floating Inspect Modals & Tooltips):** `#171F2A` (Gunmetal) with backdrop-filter blur (`16px`) and dual-stage ambient edge luminescence: an inner stroke of `rgba(255, 255, 255, 0.05)` coupled with a tight `0 0 12px rgba(99, 221, 245, 0.15)` optical aura.
- **Active / Critical Elements:** Interactive focal points generate reactor-grade neon blooms (`0 0 16px rgba(230, 36, 41, 0.35)` for primary commands, or `0 0 12px rgba(99, 221, 245, 0.3)` for holographic diagnostic rings).

## Shapes

The HUD enforces a tight, angular, precision-milled shape language (`roundedness: 1` / 4px base radius). Broad pill curves or circular bubbles are forbidden, except for circular dial gauges and arc reactor widgets.

All major modules feature high-tech mechanical treatments:
- **Corner Brackets:** Panels incorporate micro cutouts or L-shaped bounding tick marks at opposing vertices (`top-left` and `bottom-right`) in `#63DDF5` or `#303B49`.
- **Chamfered Offsets:** Diagnostic cards and primary deployment triggers utilize a subtle 45-degree corner notch (`clip-path: polygon(...)`) to simulate reinforced titanium chassis plates.

## Components

### Buttons & Interactive Controls
- **Primary Reactor Action (Fix / Deploy / Run Patch):** Solid `#E62429` fill, `#F2F5F8` label text, chamfered corner styling, accompanied by an animated edge scan effect. Hover triggers a `#FF454A` flare with `box-shadow: 0 0 18px rgba(255, 69, 74, 0.45)`.
- **Secondary Telemetry Action:** `#10151D` surface with a 1px `#303B49` border, transitioning to `#63DDF5` on hover with a faint cyan inner glow (`inset 0 0 8px rgba(99, 221, 245, 0.2)`).
- **Ghost Action:** Borderless `#A0ADBC` monospace text accompanied by leading technical glyphs (e.g., `[SYS::EXEC]`), intensifying to `#F2F5F8` upon hover.

### Telemetry Chips & Diagnostics
- Monospace micro-chips (`label-sm`) with a 1px border.
- **Verified/Arc:** `#55E6A5` text on `rgba(85, 230, 165, 0.08)` background with a glowing status pip.
- **Active Task:** `#63DDF5` text on `rgba(99, 221, 245, 0.08)` with a pulsing live scanline.
- **Warning / Degraded:** `#FFB84D` text on `rgba(255, 184, 77, 0.08)` with a static warning glyph.

### Code Diff & Terminal Viewers
- Split gutter line numbering in `JetBrains Mono` (`code-sm`), set in `#303B49`.
- **Deletions:** Striped red pattern `rgba(230, 36, 41, 0.12)` with red-shifted text (`#FF8588`).
- **Additions:** Luminous cyan-green fill `rgba(85, 230, 165, 0.12)` with bright target text (`#55E6A5`).
- Active focal line highlighted with an ultra-thin left rail glow in `#63DDF5`.

### Diagnostic Ring & Telemetry Widgets
- Concentric SVG rings depicting AST tree health, token burn rates, and memory load.
- Dynamic dash-array rotation mimicking target-locking HUD optics.

### Input Fields & Terminal Prompts
- Deep obsidian fill (`#07090D`) with a recessed 1px outline in `#303B49`.
- Active focus replaces the border with `#63DDF5`, initiates a subtle holographic inner aura, and renders a blinking vertical block cursor (`#F5B942`).