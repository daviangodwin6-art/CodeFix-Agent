---
name: CodeFix Agent Studio
colors:
  surface: '#f9f9ff'
  surface-dim: '#d1daf4'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f3ff'
  surface-container: '#e9edff'
  surface-container-high: '#e1e8ff'
  surface-container-highest: '#d9e2fc'
  on-surface: '#121b2e'
  on-surface-variant: '#434655'
  inverse-surface: '#273044'
  inverse-on-surface: '#edf0ff'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#505f76'
  on-secondary: '#ffffff'
  secondary-container: '#d0e1fb'
  on-secondary-container: '#54647a'
  tertiary: '#943700'
  on-tertiary: '#ffffff'
  tertiary-container: '#bc4800'
  on-tertiary-container: '#ffede6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#d3e4fe'
  secondary-fixed-dim: '#b7c8e1'
  on-secondary-fixed: '#0b1c30'
  on-secondary-fixed-variant: '#38485d'
  tertiary-fixed: '#ffdbcd'
  tertiary-fixed-dim: '#ffb596'
  on-tertiary-fixed: '#360f00'
  on-tertiary-fixed-variant: '#7d2d00'
  background: '#f9f9ff'
  on-background: '#121b2e'
  surface-variant: '#d9e2fc'
typography:
  headline-xl:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.025em
  headline-xl-mobile:
    fontFamily: Geist
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  label-sm:
    fontFamily: Geist
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  code-xs:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-2xs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2rem
---

## Brand & Style

The design system embodies the ethos of modern engineering workspaces: utilitarian, distraction-free, razor-sharp, and deliberate. Built for high-frequency workflows, code reviews, automated refactoring pipelines, and real-time agent observability, the design rejects decorative fluff, synthetic glows, and heavy skeuomorphism in favor of structural clarity, density, and information speed.

### Design Movements & Tone
- **Precision Technical Minimalist:** Clear hierarchies, 1px structural hair-lines, calibrated typographic scale, and tight vertical rhythm.
- **Instrumental Focus:** Surfaces stay quiet to allow code snippets, diff markers, terminal outputs, and diagnostic graphs to command immediate attention.
- **Restraint Over Spectacle:** Interaction states are expressed through exact color shifts, crisp borders, and tight spatial offsets—never through ambient neon flares or deep blurs.

## Colors

The palette is engineered exclusively around light mode readability, optical comfort during long programming sessions, and unambiguous status states.

### Core Canvas & Structure
- **Surface Canvas (Default):** `#FFFFFF` for primary work surfaces, editor panels, and focused cards.
- **Surface Canvas (Subtle):** `#F8FAFC` for app chrome, sidebar navigations, empty containers, and inactive panes.
- **Structural Border:** `#D9E1EC` for container dividers, panel edges, and tab borders.
- **Subtle Hairline:** `#EDF2F7` for secondary table rows, nested tree node guides, and subtle separators.

### Typography & Content Levels
- **Text High-Contrast:** `#172033` for headlines, active file names, diff highlights, and critical labels.
- **Text Muted Slate:** `#64748B` for secondary meta text, timestamps, line numbers, and helper guidance.
- **Text Disabled:** `#94A3B8` for disabled actions and placeholder texts.

### Semantic Status Colors
- **Action & Running:** `#2563EB` (Primary Accent Blue) indicates in-progress agent execution, active tabs, and primary controls.
- **Success:** `#16A34A` for passing unit tests, merged pull requests, and verified security patches.
- **Error:** `#DC2626` for syntax failures, compile errors, runtime regressions, and failed runs.
- **Warning:** `#D97706` for lint warnings, non-critical deprecations, and potential merge conflicts.

Use semantic accents with a restrained hand: badges and alerts combine a light 10% tint background with a 1px solid border and high-contrast text rather than saturated full-bleed blocks.

## Typography

Typography prioritizes density, uniform legibility, and technical accuracy.

### Font Families
- **Prose & Interface (`Geist`):** Delivers clean geometry, crisp horizontal metrics, and high structural legibility at small sizes (11px–13px).
- **Code & Logs (`JetBrains Mono`):** Designed for high-speed scanning of code diffs, branch signatures, file hashes, commit IDs, and terminal stdout.

### Rules of Application
- Use negative letter-spacing strictly for headings (`headline-xl` through `headline-md`) to ensure authoritative tightness.
- Use tabular figures (`font-variant-numeric: tabular-nums`) across all timestamps, line numbers, issue counters, and diff statistics.
- Avoid all-caps text except for abbreviated status badges (e.g., `CI`, `PR`, `DIFF`, `SHA`) rendered at `label-sm` or `code-xs`.

## Layout & Spacing

The layout model is driven by a disciplined 8px base rhythm (with a 4px sub-step for tight controls like file trees and micro-badges).

### Layout System
- **Workbench Architecture:** Split-pane interface consisting of a collapsible left sidebar (240px–300px fixed width), a dynamic central work canvas, and a collapsible diagnostic/diff inspector panel (380px–480px).
- **Grid Adaptability:**
  - **Desktop (>= 1280px):** 3-panel orchestration with dynamic splitters; gutters default to `1.5rem`.
  - **Tablet (768px – 1279px):** Inspector defaults to an off-canvas drawer; sidebar collapses to an icon rail (56px).
  - **Mobile (< 768px):** Single active view reflow with horizontal tab switching between Editor, Diff, and Terminal. Canvas margin compresses to `1rem`.

### Density Controls
- High-density lists (e.g., file explorers, commit logs) use `space-xs` (4px) vertical row spacing and `space-sm` (8px) horizontal padding.
- Input groups, control toolbars, and filter trays maintain strict `space-sm` to `space-md` gaps.

## Elevation & Depth

Visual hierarchy is maintained via physical plane stacking and crisp boundary lines rather than heavy drop shadows or blurred planes.

### Surface Tiers
- **Tier 0 (Base / Frame):** `#F8FAFC` — Shell chrome, breadcrumbs bar, file navigation panes.
- **Tier 1 (Panels & Editor Surfaces):** `#FFFFFF` — Primary code editor, document body, diff containers. Outlined by `1px solid #D9E1EC`.
- **Tier 2 (Floating Popovers & Flyouts):** `#FFFFFF` — Autocomplete menus, branch switchers, tooltip overlays. Outlined by `1px solid #D9E1EC` backed by a micro-shadow.

### Micro-Shadow Specifications
- **Floating Controls (Menus & Flyouts):** `0 1px 2px 0 rgba(23, 32, 51, 0.05), 0 4px 12px 0 rgba(23, 32, 51, 0.07)`
- **Modals & Dialogs:** `0 8px 24px -4px rgba(23, 32, 51, 0.10), 0 2px 6px -1px rgba(23, 32, 51, 0.04)`
- **Flat Containers:** No shadow. Hierarchy is delineated entirely by background shifts (`#F8FAFC` vs `#FFFFFF`) and the `#D9E1EC` border.

## Shapes

The interface balances sharp industrial utility with comfortable, refined corner radiuses. Elements never feel bulbous or bubbly.

### Token Mapping
- **Micro Radii (`rounded-sm` / 4px):** Code blocks, diff chunk chips, inline tags, check boxes.
- **Default Interactive (`rounded-md` / 6px to 8px):** Buttons, text fields, menu options, dropdowns, table cards.
- **Container Radii (`rounded-lg` / 10px):** Split-pane preview panels, diff comparison windows, dialog wrappers.
- **Capsule Radii (`rounded-full`):** Avatar indicators and pulse badges for running jobs only.

## Components

### Buttons
- **Primary:** Background `#2563EB`, text `#FFFFFF`, border `1px solid #1D4ED8`. Hover: `#1D4ED8`. Active: `#1E40AF`.
- **Secondary / Ghost:** Background `#FFFFFF`, text `#172033`, border `1px solid #D9E1EC`. Hover: `#F8FAFC`, border `#CBD5E1`.
- **Subtle Destructive:** Background transparent, text `#DC2626`, border `1px solid transparent`. Hover: background `#FEF2F2`, border `#FCA5A5`.
- **Sizing:** Compact (28px height, 11px text), Standard (34px height, 13px text). Padding is horizontal-heavy (`0.5rem` to `0.75rem`).

### Form Inputs & Comboboxes
- Background `#FFFFFF`, border `1px solid #D9E1EC`, color `#172033`, border radius 6px.
- **Focus State:** Border `#2563EB`, box-shadow `0 0 0 1px #2563EB` (crisp ring, zero diffuse blur).
- Monospaced inputs (for regex search or commit message prompts) utilize `JetBrains Mono` at 13px.

### Status Indicators & Badges
- Non-pill, rectangular with 4px border radius.
- **Running:** Text `#2563EB`, background `#EFF6FF`, border `1px solid #BFDBFE`. Animated 2px dot indicator optional.
- **Success:** Text `#16A34A`, background `#F0FDF4`, border `1px solid #BBF7D0`.
- **Warning:** Text `#D97706`, background `#FFFBEB`, border `1px solid #FDE68A`.
- **Error:** Text `#DC2626`, background `#FEF2F2`, border `1px solid #FECACA`.

### Code Diff Viewer
- **Unified & Split Panes:** Border `1px solid #D9E1EC`, border radius 8px, background `#FFFFFF`.
- **Addition Line:** Background `#F0FDF4`, text prefix `+` colored `#16A34A`.
- **Deletion Line:** Background `#FEF2F2`, text prefix `-` colored `#DC2626`.
- **Gutter / Line Numbers:** Text `#94A3B8`, background `#F8FAFC`, right border `1px solid #EDF2F7`.

### Terminal & Log Streamer
- Light shell option: Background `#F8FAFC`, text `#172033`, border `1px solid #D9E1EC`, font `JetBrains Mono` 12px.
- Timestamps: Color `#64748B`, font-variant-numeric: tabular-nums.