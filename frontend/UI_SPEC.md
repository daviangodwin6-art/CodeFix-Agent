# CodeFix Agent — UI/UX spec (Stark HUD visual system)

Scope: frontend only. The API contract (`src/api.js`, `server.py`) does not change. Every feature in
`design/Frontend_Requirements.docx` (FR-1 … FR-12) stays wired. The only dependency added for the HUD is the
Space Grotesk font (`@fontsource-variable/space-grotesk`).

History: the information architecture (app shell, views, tabs, unified run view; §1 and §4–§9) comes from the
UI/UX remake. The HUD restyle (§2, §3, §10, §11) changes the look only: tokens, surfaces, panel chrome, type,
status colours and icons. Visual references: `design/stark_hud/*/screen.png` (Google Stitch exports), tokens from
`design/stark_hud/stark_hud_precision_engineering/DESIGN.md`. New motion is out of scope; spots where an animation
belongs carry a `// motion:` note.

## 1. What was wrong (audit of the pre-remake UI)

| Problem | Where | Fix |
|---|---|---|
| Layout reshuffles between 2 and 3 columns with three different width sets (idle / live / done); the run form sits above the projects so navigation is buried | `App.jsx` GRID | Fixed app shell: header + project sidebar + one main view |
| The run form is always on screen even while you read a project or a finished run; during a run it turns into read-only fields | `ConfigColumn` | Form ("composer") only lives in the Home and Project views; the run view shows task/repo as read-only text |
| Results for one run are split over three columns (progress, metadata+imports, results) | App / Progress / Results | One Run view: steps on the left, outcome on the right, metadata under it |
| Glass panels, ambient blobs, spotlight; slate-500 text on translucent surfaces fails contrast | `index.css`, everywhere | Solid surfaces, tokenised palette, muted text ≥ 4.5:1 |
| `window.confirm` for PR and "write into folder" | `ProjectView` | Styled `ConfirmDialog` on native `<dialog>` |
| Segmented "radio" buttons have no arrow-key support; account menu never closes on Escape / outside click | ConfigColumn, Header | Native radio inputs; native `popover` menus |
| You cannot leave a live run (button only after it finishes), although the run keeps going (FR-9) | App | "Leave (run keeps going)" during a live run; "Show live run" on a busy project |
| Cumulative diff and stored runs replace the project card with a bare detail view | ProjectView | Tabs: History / Changes / Activity; stored run opens in the shared Run view |
| Loading = plain "Loading…" text; first paint is blank (`return null`) | everywhere | Skeletons, a splash while `/api/me` answers |
| Copy button gives no feedback | ui.jsx | "Copied" state + live region |
| Run button allowed with an empty task (server answers 400) | ConfigColumn | Disabled until a task is typed |

## 2. HUD design tokens (`tailwind.config.js`, `src/index.css`)

Dark only. The token **names** from the remake are kept so every screen keeps working; their **values** are now the
HUD palette. Two tokens are new: `gold` and `reactor`.

| Token | Hex | DESIGN.md name | Use | Contrast (text) |
|---|---|---|---|---|
| `canvas` | `#07090D` | Obsidian Black | page floor, input fill, terminal / diff wells | — |
| `surface` | `#10151D` | Deep Armor | panels (level 1), header, sidebar | — |
| `raised` | `#171F2A` | Gunmetal | tiles inside panels, hover rows, menus, dialogs (level 2) | — |
| `line` | `#303B49` | Dark Titanium | panel perimeters, dividers | — |
| `line-strong` | `#5A6779` | — | input / control outlines, inactive corner brackets (≥3:1 on canvas, so fields stay findable) | — |
| `ink` | `#F2F5F8` | Titanium White | primary text, button label on red | 15.2 on raised |
| `ink-2` | `#A0ADBC` | Steel Grey | secondary text, labels | 7.3 on raised |
| `ink-3` | `#8D9AAB` | — | meta / hints / diff gutters (floor for any text) | 5.8 on raised |
| `accent` | `#D61F24` | Armor Red (darkened for AA) | primary-action fill, active-nav fill, brackets on the run composer | ink on it 4.7 |
| `accent-hover` | `#E62429` | Armor Red | primary hover fill (label turns `#fff`, 4.5) | — |
| `reactor` | `#FF454A` | Reactor Red | glow colour, decorative pips, large display text only | 4.9 on raised |
| `accent-fg` | `#63DDF5` | Holographic Cyan | active / running / info, focus ring, selection, brackets, links | 10.4 on raised |
| `gold` | `#F5B942` | Stark Gold | structural highlights: section codes, counts, kind "Other's", telemetry values | 9.4 on raised |
| `ok` | `#55E6A5` | Arc Green | success, additions | 10.5 on raised |
| `warn` | `#FFB84D` | Amber Alert | busy, retry, env fault | 9.7 on raised |
| `bad` | `#FF8588` | red-shifted text | failure, destructive, deletions | 7.1 on raised |

Rules:
- `#E62429` / `accent` is **never** used for text (4.1:1). Red text is `bad`; red decoration is `accent`/`reactor`.
- Tinted chips/notices: `bg-<tone>/10 border-<tone>/40 text-<tone>` — every tone keeps ≥ 6.5:1 on its own tint.
- Status is never colour alone: always text, plus an icon or pip.

Fonts: **Space Grotesk** (`font-display`) for view titles, panel display titles and the primary button;
**Geist** (`font-sans`, body; stands in for DESIGN.md's Inter, which is not bundled) for sentences;
**JetBrains Mono** (`font-mono`) for HUD labels, chips, buttons, numbers, ids, shas, paths, diffs.
Type scale: view title `font-display text-2xl sm:text-3xl font-bold tracking-tight` (uppercase allowed on short titles);
panel title = `PanelTitle`; HUD micro-label = `LABEL` (mono 12px semibold uppercase, tracking 0.12em) — 12px (`text-xs`) is the
floor for all text; body `text-sm`; meta `text-xs`.
Wide screens: the root font size steps up to 112.5% at ≥1600px (laptops keep 100%), so type and spacing
(all rem) scale together; nothing uses fixed px font sizes.
Uppercase is a CSS transform (`uppercase`) on short labels, buttons and titles only — never on sentences, task text,
paths or error messages; the DOM text keeps its normal case (requirements quote exact strings).

Shape: angular. Panels `rounded` (4px), controls and chips `rounded-sm` (2px). `rounded-full` only for status pips,
the avatar, dial rings and the motion switch knob.

Depth (no drop shadows):
- Canvas: `#07090D` plus a 32px technical grid (`rgba(48,59,73,.25)`) on `body`.
- Panel (level 1): `surface` + 1px `line` + a cyan top-edge light leak (`hud-panel`).
- Floating (level 2: dialogs, menus): `raised` + 1px `line` + `shadow-aura` (inner white 5% + cyan 12px aura).
- Glows: `shadow-glow-red` (primary hover), `shadow-glow-cyan` (active rings), `shadow-inner-cyan` (secondary hover, focused field).

Focus: `:focus-visible { outline: 2px solid accent-fg; outline-offset: 2px }`. Chamfered primary buttons draw the
outline inside (`outline-offset: -4px`, `ink` colour) because `clip-path` would cut an outside ring. Never remove focus.

Motion: unchanged. `html.motion` gates every animation (Motion switch, FR-11, default from `prefers-reduced-motion`);
anime.js `enter` / `pop` / `CountUp` stay. No new keyframes in this round.

## 3. Shared primitives (`src/components/ui.jsx`, `src/index.css`)

CSS component classes (`index.css`, `@layer components`):
- `hud-panel` — level-1 panel: `relative`, surface fill, 1px line border, 4px radius, cyan top-edge light leak.
- `hud-corners` — L-shaped 10px corner ticks on the top-left and bottom-right vertices (cyan). Add
  `hud-corners-red` for red ticks (the run composer), `hud-corners-dim` for `line-strong` ticks. Needs a positioned element.
- `hud-chamfer` — 45° notches on the top-right and bottom-left corners (`clip-path`) for primary triggers.
- `hud-well` — recessed `canvas` box with 1px line border for terminals, code and diffs.

JS (`ui.jsx`):
- `Icon`, `short`, `plural`, `duration`, `ago`, `KIND`, `Copy`, `Spinner`, `Dialog`, `ConfirmDialog` — same API.
- `CARD` = level-1 panel (`hud-panel`); `CARD_CORNERS` = `CARD` + `hud-corners`.
- `LABEL` → class string for HUD micro-labels (mono 12px uppercase tracking, `text-ink-2`).
- `PanelTitle({ icon, children, meta, as = "h2", id, className })` — panel header row: cyan icon, mono uppercase title
  in `ink`, optional right-aligned `meta` (mono, `gold`).
- `Stat({ label, children, tone, className })` — telemetry tile (`raised`, 1px line): `LABEL` dt, mono value dd.
  Must sit inside a `<dl>`.
- `button(variant = "secondary", size = "md")` → class string. All buttons: mono, uppercase, tracking 0.08em, 2px radius.
  - `primary` — "reactor action": red fill + `ink` label, chamfered, `font-display`; hover `accent-hover` + white label + red glow.
  - `secondary` — "telemetry action": surface fill, 1px line; hover cyan border/label + inner cyan glow.
  - `ghost` — no border, `ink-2`, hover `ink` on `raised`.
  - `danger` — `bad` outline + label; hover red tint.
  - Sizes `sm` (h-8, 12px), `md` (h-9, 13px), `lg` (h-12, 14px; ≥44px touch target). Disabled = 50% opacity, no glow.
- `FIELD` — obsidian (`canvas`) fill, 1px `line-strong`, gold caret; focus: cyan border + 1px cyan ring + inner cyan aura.
- `Notice({ tone, title, children, onDismiss, className })` — tinted box with a 2px left rail in the tone colour; mono
  uppercase title; `role="alert"` for `bad`, `role="status"` otherwise.
- `StatusPill({ status })` — telemetry chip: 2px radius, 1px tone border, mono 12px uppercase, glowing pip (spinner
  while running) + text. Same labels as before.
- `KindBadge({ kind })` — chip: My repo = cyan, Other's = gold, Local = steel.
- `Skeleton({ className })` — `raised` block, 2px radius (pulse only under `html.motion`).
- `Logo({ className })` — decorative SVG reactor mark (concentric rings), `aria-hidden`.
- `Ring({ value, size, stroke, tone, children, label })` — SVG dial gauge (0…1); `role="img"` + `aria-label` from
  `label`; children are centred inside. Only for real values (e.g. finished steps / total steps).
- `Dialog` — level-2 surface (`raised`, `shadow-aura`, `hud-corners`), Space Grotesk title, dimmed + blurred backdrop.

## 4. App shell (`App.jsx`, `Header.jsx`, `Projects.jsx`)

```
[skip link "Skip to content"]
header (sticky, h-14, bg-surface, border-b)
  logo + "CodeFix Agent" | breadcrumb | ……… | API status pill | Motion switch | account
body  lg: grid [18rem | 1fr], 2xl: [21rem | 1fr]; main max-w-[110rem], so wide screens are filled
  nav#projects  (sticky under header, own scroll)   main#main
    "New run" button                                  global error Notice (dismissable)
    filter box (when > 4 projects)                    one view: Home | Project | Run
    project list / skeleton / empty state
    signed-out callout (Sign in with GitHub)
```
- Below `lg` the sidebar stacks above main; its list is capped at `max-h-64` with its own scroll.
- Breadcrumb (`crumbs` prop): `Home` → `<project name> @ <head sha>` → `Run <id>`; earlier crumbs are buttons. Replaces the "project: name @ head" label (shown when the form is linked to the project), otherwise shows the repository name.
- API status: dot + text ("API online" / "API offline"); `role="status"`.
- Account (signed in): avatar button opens a native `popover` menu: "Signed in as <login>" (link to profile) + "Sign out". Signed out: "Offline mode" badge (md+) + "Sign in" button (FR-12 / known gap: returns to the login screen).
- Splash while the first `/api/me` is pending: centred logo + spinner + "Connecting to the local server…".
- Focus: when the view changes (home ↔ project ↔ run ↔ stored run), focus moves to the view's heading (`id="view-title"`, `tabIndex={-1}`).

Views (App decides):
- **Home** (no active project, no run): h1 "Start a new run" + one-line explainer, `Composer` in a card, and a 4-step strip "Understand → Change → Test → Verify" with one sentence each.
- **Project** (active project, no run): `ProjectView` with the `Composer` passed in as `composer`.
- **Run** (`busy || run`): `RunView`.

Sidebar project row (button, `aria-current="page"` when active): status dot + sr-only text, name, `KindBadge`, env text (`env ready` / `env missing` / `running…` with spinner); second line mono meta `branch · N changes · N runs · 2 min ago`. Empty state: "No projects yet" + "Your first run creates one." Loading: 3 skeleton rows. "New run" is highlighted (`aria-current`) on Home.

## 5. Composer (`ConfigColumn.jsx`, default export `Composer`, keeps `TYPES` export)

Props: `form, setForm, me, repos, onRefreshRepos, busy, onRun, linked, conflict`.
- Task type: segmented control of native radios "Debug — fix a bug" / "Feature — add behaviour". Switching keeps the sample-swap rule (FR-2/§5 of requirements).
- Repository:
  - When `linked` (a project is active and the field still points at it): read-only summary "Runs on **name** · continues from head `abc1234` · N earlier changes kept" + ghost button "Use a different repository" which reveals the selector below.
  - Selector: native radio group "Whose repository?" My repo / Other's / Local (fieldset + legend, arrow keys work). GitHub modes disabled when signed out with a visible hint "Sign in with GitHub to use GitHub repositories." (FR-7).
  - My repo: select (+ "Loading…" / "No repositories found", "(private)" suffix, project repo stays selectable) + refresh icon button `aria-label="Refresh repository list"`.
  - Other's: input, placeholder `https://github.com/owner/name`, hint "A public repository you can't push to. CodeFix forks it."
  - Local: input, hint "Folder path or git URL. Your original folder is never modified."
- Task: label = `TYPES[type].label`; textarea 4 rows, placeholder "Describe the next bug or feature…"; hint "Ctrl+Enter to run" (+ for Feature "Name any required function or module exactly."). Ctrl/Cmd+Enter submits.
- Submit: `button("primary","lg")` full width, "Run repair" (debug) / "Build feature" (feature), `play_arrow` icon; "Starting…" while `busy`; disabled while busy or task empty.
- `conflict` → `Notice tone="warn"`: "Project is busy. A run is already active on <name>. You can start a run on another project."

## 6. Project view (`ProjectView.jsx`)

Props: `project, composer, onChanged, onDeleted, onRerun, onSignedOut, onWatch`.
- Header card: h1 name (`id="view-title"`) + KindBadge; source line (local: "Snapshot of <folder> · your original folder is unchanged"); toolbar:
  - GitHub: `Open PR`/`Update PR` (primary), `Sync with upstream`, link "View pull request" when https.
  - Local: `Export patch` (primary).
  - `More` menu (native popover): `Reset to…`, `Rebuild environment`, separator, `Delete project` (danger).
  - Disabled while busy or another action works (except tabs). Busy → `Notice warn` "A run is in progress on this project." + button "Show live run" (`onWatch`).
- Action outcome: `Notice` under the toolbar (same texts as today), `role="status"`; 409 = warn, error = bad.
- State tiles `dl` (2 cols mobile, 5 on xl): Branch, Head, Ahead of base, Environment, Locked tests.
- Section "Run a new task" containing `composer`.
- Tabs (WAI-ARIA tabs, arrow keys / Home / End): **History (N)**, **Changes**, **Activity (N)**.
  - History: rows = StatusPill, task (button → stored run in `RunView stored`), mono meta, `Re-run` button (fills composer, focuses task box). Running row: "Show live" → `onWatch`. Skeleton while `runs === null`; empty "No runs yet. Describe a task above to start one." Base line at the bottom.
  - Changes: loads `GET …/diff?from=base` on first open; skeleton; error Notice; empty "No changes ahead of base."; meta "base abc → head def · N changes"; `<Changes r={{ diff }} />`.
  - Activity: project events (kind · detail · ago); empty "No resets, syncs or exports yet."
- PR and "Write into the original folder…" use `ConfirmDialog` (texts from today's `window.confirm`). Reset and Delete dialogs keep their behaviour and strings.

## 7. Run view (`Results.jsx` default export `RunView`; `Progress.jsx` exports `Steps`, `BuildsOn`)

`RunView` props: `run, busy, steps, elapsed, head, project, task, taskType, repoLabel, onBack, backLabel, stored`.
- Header card: back button (`onBack`; label `backLabel`; while live it reads "Leave — run keeps going"), StatusPill + timer (`m:ss`, tabular), h1 = task (`id="view-title"`), meta: repo · Debug/Feature · run id · "continuing from head abc1234". Stored runs: "Past run" tag and step timings come from the steps.
- sr-only `aria-live="polite"` line: "Step <name> running" / final status.
- Body: `xl:grid-cols-[minmax(300px,360px)_1fr]`.
  - Left: `Steps` — vertical timeline (connector line, numbered nodes, state icon + sr text, name, duration, detail). Running step highlighted with `aria-current="step"`; rejected attempt followed by another = "retry" (warn). Sticky on xl.
  - Right, live: "Working on: <current step>" card + `BuildsOn` (what the run builds on; "If this run fails, the project goes back to abc1234.").
  - Right, finished: outcome banner (Succeeded / Failed / Environment setup failed, one-line summary, chip "Change committed" / "Working copy reverted" / "Run halted"), "What changed & root cause" (success), syntax repair, failure diagnostics `<pre>`, note, test matrix (before/after) + regressions + new tests, `Changes` (file picker + diff), Run metadata (branch, attempts, reproduced/mode, report path + commit with Copy), Verified imports.
- `Changes({ r })` stays exported (used by ProjectView). File list = toggle buttons (`aria-pressed`); diff in a focusable scroll region; ± signs and line numbers so colour is not the only cue.

## 8. Login (`Login.jsx`)

Two columns on lg (left: name, one-line pitch, the 5 stages Understand / Plan / Modify / Test / Verify as a short list; right: sign-in card), one column on mobile. Card: "Continue with GitHub" (primary, lg; "Waiting for GitHub…"; disabled when not configured + the not-configured hint), error `Notice bad`, divider "or", "Continue offline" (secondary) + "Local folders only, no GitHub account needed.", token note. Top bar: API status + Motion switch. Drop the decorative Secure/Fast/Reliable row and the Firebase logo.

## 9. Accessibility checklist (all agents)

Landmarks (`header`, `nav`, `main`), one `h1` per view, skip link, labels on every control, `aria-current` for active nav/step, visible focus, no colour-only status, 44px min touch targets on mobile for primary actions, `prefers-reduced-motion` respected via the Motion switch default, dialogs on native `<dialog>`, menus on native `popover`, no horizontal page scroll at 360px (diffs scroll inside their own box).

## 10. HUD screen notes (reference → screen)

| Reference (`design/stark_hud/…`) | Screen | What is taken | What is not |
|---|---|---|---|
| `system_access_console` | `Login.jsx` | single centred console panel with cyan top leak and corner ticks; reactor mark + dial rings; status chip row; red full-width "Continue with GitHub"; offline action as a recessed secondary bar; mono meta lines | fake coordinates, power/sync %, port, firmware, clearance text |
| `engineering_command_console` | `App.jsx` Home, `ConfigColumn.jsx`, `Header.jsx` | header: reactor logo + display wordmark, mono breadcrumb chip bar, `API ONLINE` chip, `MOTION` switch, square avatar; composer panel with red corner brackets; Debug/Feature as two large selectable cards (still native radios); repository mode as a tab bar (native radios); task box as a terminal well; big chamfered red run button | sidebar section nav (we keep the Projects list), tokens/symbols/model counters, latency, chassis image, "reactor output" bar |
| `project_intelligence_archive` | `Projects.jsx`, `ProjectView.jsx` | sidebar rows as ledger cards with a cyan left rail when active; mono meta; workspace header with display title and `::`-separated mono facts; state tiles as `Stat`s; run history rows with status pip + mono run line + chip; actions as a command matrix of telemetry buttons | totals strip with invented numbers, GPU/daemon tiles, hardware image |
| `live_execution_hud` | `Progress.jsx`, `Results.jsx` (live) | run header with mono run id, stage chip `STAGE n/N`, mono timer; dial `Ring` showing finished/total steps; "Execution sequence" list with `01.` numbering, right-aligned mono state, red left rail + cyan pip on the running step; terminal-styled detail | CPU/MEM/sockets/RTT, velocity bar chart, fake log lines |
| `verification_diff_report` | `Results.jsx` (finished) | outcome headline in display caps with tone chip; metric tiles (duration, tests, files, attempts, commit + Copy); file picker + diff in a `hud-well`; test matrix as a terminal panel; action bar | confidence %, cyclomatic complexity, memory footprint, "signed by" footer |

Layout stays as §4–§8 (header + Projects sidebar + one main view; tri-pane only where the run view already has two columns).
At 375px: everything stacks, no horizontal page scroll; diffs and terminals scroll inside their own box.

## 11. Data honesty (all screens)

The references are filled with invented telemetry. The product shows **only real data** from the API:
- Allowed decoration: separators (`//`, `::`, `[ ]`), section codes made from real values (`RUN <id>`,
  `STAGE 4/10`, `HEAD abc1234`, `N FILES`), corner ticks, grids, the reactor mark, dial rings fed by real counts.
- Not allowed: invented numbers (latency, CPU, memory, tokens, confidence, coordinates), fake names or ranks,
  fake version or build tags, Stark Industries / Marvel branding text. The product name stays "CodeFix Agent".
- A value the run never produced is shown as "not run" in a neutral colour, never as a green 0 (e.g. the after-patch
  test counts of a run that stopped before testing).
- User-facing sentences, labels and messages keep their current wording (they are quoted in the requirements);
  only their styling changes.
