---
name: Shipyard
description: Crash-test dummies for enterprise agents. A deploy gate where every scenario is an inspection tag.
colors:
  tag-stock: "oklch(0.985 0.003 250)"
  card-white: "oklch(1 0 0)"
  ink-navy: "oklch(0.21 0.025 255)"
  notice-blue: "oklch(0.38 0.11 255)"
  notice-blue-ring: "oklch(0.55 0.13 255)"
  quiet-surface: "oklch(0.955 0.008 250)"
  quiet-ink: "oklch(0.48 0.02 255)"
  hover-tint: "oklch(0.94 0.02 250)"
  rule: "oklch(0.9 0.008 250)"
  input-rule: "oklch(0.86 0.01 250)"
  rail-navy: "oklch(0.27 0.06 255)"
  rail-active: "oklch(0.34 0.07 255)"
  rail-ink: "oklch(0.9 0.015 250)"
  rail-muted: "oklch(0.74 0.03 250)"
  destructive-red: "oklch(0.55 0.2 27)"
  pass-green: "oklch(0.5 0.11 158)"
  pass-subtle: "oklch(0.965 0.03 158)"
  pass-border: "oklch(0.85 0.06 158)"
  fail-red: "oklch(0.52 0.19 27)"
  fail-subtle: "oklch(0.965 0.025 27)"
  fail-border: "oklch(0.85 0.07 27)"
  lockout-red: "oklch(0.45 0.17 25)"
  running-ink: "oklch(0.5 0.1 70)"
  caution-yellow: "oklch(0.83 0.14 85)"
  caution-yellow-ink: "oklch(0.25 0.05 70)"
  running-subtle: "oklch(0.97 0.035 85)"
  running-border: "oklch(0.86 0.09 85)"
  warn-amber: "oklch(0.5 0.12 55)"
  warn-solid: "oklch(0.78 0.13 65)"
  warn-subtle: "oklch(0.965 0.035 70)"
  warn-border: "oklch(0.86 0.08 65)"
  draft-grey: "oklch(0.48 0.02 255)"
  draft-subtle: "oklch(0.945 0.006 250)"
  diff-add-bg: "oklch(0.955 0.04 158)"
  diff-remove-bg: "oklch(0.955 0.035 27)"
  diff-change-bg: "oklch(0.965 0.035 75)"
  diff-cell: "oklch(0.9 0.09 80)"
typography:
  verdict:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 750
    lineHeight: 1
    letterSpacing: "0.04em"
    fontVariation: "'wdth' 78"
  headline:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: "2.125rem"
  counter:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: "2.5rem"
    fontFeature: "'tnum'"
  status-word:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 750
    lineHeight: 1
    letterSpacing: "0.04em"
    fontVariation: "'wdth' 78"
  title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.625rem"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  dense:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  field-label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: "1rem"
    letterSpacing: "0.06em"
  data:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.375rem"
    fontFeature: "'tnum'"
  tag-code:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: "1rem"
rounded:
  xs: "2px"
  sm: "3px"
  md: "4.5px"
  lg: "6px"
  xl: "9px"
  full: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
components:
  button-primary:
    backgroundColor: "{colors.notice-blue}"
    textColor: "{colors.tag-stock}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  status-pill-failed:
    backgroundColor: "{colors.fail-red}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  status-pill-blocked:
    backgroundColor: "{colors.lockout-red}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  status-pill-live:
    backgroundColor: "{colors.pass-subtle}"
    textColor: "{colors.pass-green}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  status-pill-running:
    backgroundColor: "{colors.running-subtle}"
    textColor: "{colors.running-ink}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  status-pill-draft:
    backgroundColor: "{colors.draft-subtle}"
    textColor: "{colors.draft-grey}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  tag-band-failed:
    backgroundColor: "{colors.fail-red}"
    textColor: "{colors.card-white}"
    typography: "{typography.status-word}"
    padding: "10px 12px"
  tag-band-running:
    backgroundColor: "{colors.caution-yellow}"
    textColor: "{colors.caution-yellow-ink}"
    padding: "8px 12px"
  scenario-tag:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.md}"
    padding: "0 12px 12px"
  lockout-banner:
    backgroundColor: "{colors.lockout-red}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.lg}"
    padding: "20px"
  live-banner:
    backgroundColor: "{colors.pass-subtle}"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.lg}"
    padding: "20px"
  filter-segment-active:
    backgroundColor: "{colors.notice-blue}"
    textColor: "{colors.tag-stock}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  rail:
    backgroundColor: "{colors.rail-navy}"
    textColor: "{colors.rail-ink}"
    width: "232px"
    padding: "16px"
  rail-item-active:
    backgroundColor: "{colors.rail-active}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  disagreement-callout:
    backgroundColor: "{colors.fail-subtle}"
    textColor: "{colors.fail-red}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  diff-row-added:
    backgroundColor: "{colors.diff-add-bg}"
    textColor: "{colors.ink-navy}"
    typography: "{typography.data}"
    padding: "6px 8px"
  spec-editor:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink-navy}"
    typography: "{typography.data}"
    rounded: "{rounded.md}"
---

# Design System: Shipyard

## Overview

**Creative North Star: "The Inspection Tag"**

A deploy is an inspection, and every scenario is a tag hung on the version. Passing tags are quiet: an icon, a condensed word, a name. A failing tag is loud: a solid red band across its top, the punched eyelet around its icon, the proof printed on the tag itself. When the data is wrong the whole version gets a lockout tag at page scale, and that banner says what is still protected. The rest of the interface stays out of the way: a cool tag-stock ground, a committed Notice-blue rail, 1px rules, crisp small corners, standard shadcn controls.

This is an Operate-mode working tool built to read from the back of a room. Light is the projector theme and the default; dark is fully supported through the `.dark` class (next-themes, storage key `sy-theme`). Density is table-dense with generous emphasis reserved for verdicts: one strip of big numerals, one banner, one band per failure. Nothing in the world is decorative except the eyelet ring.

The world refuses the grey dashboard of identical green and red pills where the reply grade weighs as much as the data grade. No gradients beyond the functional running sheen, no glass, no glow, no hero-metric cards.

**Key Characteristics:**
- Asymmetric verdict weight: failures carry solid bands, passes carry only icon + word.
- Safety inks (green, red, lockout red, caution yellow, amber) carry state and nothing else; Notice blue carries action and nothing else.
- One family, two voices: Archivo at normal width for UI, Archivo condensed caps (wdth 78, weight 750) for status words.
- Geist Mono only for data: spec YAML, assertions, diffs, run ids, money, durations.
- Flat surfaces separated by 1px rules; no shadows at rest.
- One authored motion moment: the verdict landing on a tag.

## Colors

Restrained cool neutrals on a slightly blue tag stock, one committed Notice-blue field for the shell, and a reserved set of safety inks that appear only where they carry state. Every status ink has five roles: text ink, solid band fill, ink on the band, subtle tint, and 1px border. Dark mode redefines each role (lighter inks, deeper tints) under the same names.

### Primary
- **Notice Blue** (notice-blue): primary buttons (Deploy, Run the gate again), the active filter segment, links, the changed-since-live gutter mark in the spec editor, text caret, selection tint (22% mix). In dark mode it lifts to a pale periwinkle with navy ink.
- **Notice Ring** (notice-blue-ring): the 2px focus outline, offset 2px, on every focusable element.

### Secondary
- **Rail Navy** (rail-navy): the committed shell field, desktop rail and mobile top bar alike. Near-black navy in dark mode.
- **Rail Active** (rail-active): the active nav item fill. Rail text uses **Rail Ink** (rail-ink) and **Rail Muted** (rail-muted) for inactive items and meta.

### Tertiary (status inks)
- **Pass Green** (pass-green, teal-shifted to hue 158): PASSED / Live words and icons, the passed counter, the live pill and Live banner icon. Pairs with **Pass Subtle** and **Pass Border** for the live pill and Live banner.
- **Fail Red** (fail-red, orange-shifted to hue 27): the FAILED band, the failed pill, the failed tag outline, the End state FAIL block, "got" values, error-line gutter numbers. **Fail Subtle** and **Fail Border** form the disagreement callout and spec error-line highlight.
- **Lockout Red** (lockout-red): deeper than fail, always solid. The BLOCKED banner and the blocked pill only.
- **Caution Yellow** (caution-yellow, with **Caution Yellow Ink** on top): the UNDER TEST band and the running progress bar. **Running Ink** (running-ink) for running words on cards; **Running Subtle / Running Border** for the running panel and running pill.
- **Warn Amber** (warn-amber): untested tools, ERROR void tags, not-graded counts, unsaved state, line budget overrun. **Warn Subtle / Warn Border** for the gate error banner and error states; **Warn Solid** for the timeline error mark and the API-down dot.
- **Draft Grey** (draft-grey on draft-subtle): draft and no-version pills.
- **Diff tints**: added rows on **Diff Add**, removed rows on **Diff Remove**, changed rows on **Diff Change**, and the exact changed cell on the stronger **Diff Cell**. Glyph inks reuse pass, fail, and warn.

### Neutral
- **Tag Stock** (tag-stock): the page ground.
- **Card White** (card-white): tags, panels, tables, the editor body.
- **Ink Navy** (ink-navy): primary text.
- **Quiet Surface** (quiet-surface): muted fills (version chip, editor gutter and header bar, JSON blocks, the agent-said quote box).
- **Quiet Ink** (quiet-ink): secondary text, the Reply check row, meta, labels.
- **Hover Tint** (hover-tint): table row hover and keyboard focus fill.
- **Rule** (rule) and **Input Rule** (input-rule): every 1px border and input stroke.
- **Destructive Red** (destructive-red): destructive actions only (Confirm rollback, Reject). Never a status.

### Named Rules
**The Notice Blue Rule.** Blue means "you can act here" and is never a status. Green, red, and yellow mean state and are never a button fill.

**The Loud Failure Rule.** Only FAILED and BLOCKED get solid fills. Passed, live, running pill, error, and draft get a tint or nothing. The ink-weight difference, not hue, is what makes the one bad tag findable and what keeps the board legible in greyscale.

**The Never Color Alone Rule.** Every status is icon + word + color, and the icons differ in shape: circle-check (pass, live), octagon-x (fail), dashed ring (running), padlock (blocked), triangle (error, warn), pencil (draft).

**The Separate Ambers Rule.** Running and warn share the amber family, so they never appear in the same component. A running tag has no warnings; warn lives in diffs, coverage, errors, and void tags.

## Typography

**Display Font:** Archivo (variable, wght plus the wdth axis, loaded through next/font with `axes: ["wdth"]`), falling back to ui-sans-serif, system-ui
**Body Font:** Archivo at normal width
**Label/Mono Font:** Geist Mono, falling back to ui-monospace, SFMono-Regular, Menlo

**Character:** One sturdy grotesque that speaks in two voices: calm and open at normal width for the interface, compressed and heavy in caps for the tag-header verdicts. Geist Mono is the voice of evidence, never decoration.

### Hierarchy
- **Verdict** (750, 48px at sm and up / 36px below, condensed caps, line-height 1): BLOCKED. and LIVE. on the gate banner; FAIL in the catch spotlight's End state block.
- **Headline** (700, 28px, 34px line): page titles and the banner sentence ("v3 is still serving." at weight 500). Headings use `text-balance`.
- **Counter** (700, 36px, tabular): the counters strip numerals only. Verdict counts sit at 28px beside their icon and word.
- **Status Word** (750, condensed caps, +0.04em): 22px for End state verdicts, 24px in the FAILED band, 14-15px for PASSED, ERROR, and UNDER TEST faces. Never below 14px.
- **Title** (600, 18px): scenario names on tags, group headers, panel titles.
- **Body** (400, 15px, 24px line): default text. Prose caps at 70ch.
- **Dense** (400, 14px): table cells, secondary lines, assertion labels, breadcrumbs.
- **Field Label** (600, 12px, +0.06em, uppercase, quiet ink): tag fields ("End state", "Reply check", "The agent said") and timeline event types.
- **Data** (Geist Mono 13-14px, tabular, no ligatures): spec YAML (14px on a 22px line), expected/got lines, diff tables (12px), run ids, costs, durations.
- **Tag Code** (Geist Mono 11px): the short scenario codes (MS-03, SP-01) on tag bands.

### Named Rules
**The One Family Rule.** The condensed verdict voice comes from Archivo's width axis, not a second display face. Status words always use the status-word setting.

**The Mono Is Evidence Rule.** Monospace is for data, code, and money only. Labels and prose stay in Archivo.

**The Tabular Numbers Rule.** Tables, counters, costs, and diffs always use tabular numerals. Money reads `$25.00` in diffs, `−$25.00` with a true minus for negatives, and four decimals for sub-cent run costs (`$0.0041`).

## Layout

A fixed 232px Notice-blue rail on the left at 1024px and up; below that, the rail becomes a sticky top bar in the same field holding the wordmark, production status, theme toggle, and a compact icon nav row. The main column has 16px gutters on mobile and 24px on desktop, 24px top padding (32px desktop), and content capped at 1440px.

The gate board stacks in this order with 24px between blocks: verdict banner (absent while running), header row (breadcrumb, title, version chip, status pill, then mono stats right-aligned: Took, Cost, Pass rate), running panel (while running), counters strip between 1px top and bottom rules, catch spotlight, sticky filter row, then source groups. Groups holding a failure move to the top once the verdict is in, never while running. The tag grid is `auto-fill, minmax(min(300px, 100%), 1fr)` with 12px gaps and `align-items: start`; failed tags span two columns at 1024px and up.

The run trace runs two columns at 1280px and up (timeline 7/12, twin diff 5/12), stacked below. The agent page runs editor 7/12 beside a tabbed side panel 5/12 at 1280px and up.

Spacing follows Tailwind's 4px scale with a working rhythm of 4 (inside chips), 8 (icon to label), 12 (inside tags, grid gaps), 16 (tag body, banner gaps, mobile gutters), 20 (banner padding), 24 (between blocks, desktop gutters). No horizontal scroll at 375px: tables become stacked rows.

## Elevation & Depth

Flat by default. Every surface (tags, banners, panels, tables, the editor) is a card-white or tinted fill with a 1px rule; nothing in the Shipyard components carries a shadow at rest or on hover. Depth comes from tonal contrast (tag stock vs card white vs quiet surface) and from the solid bands. Overlays (dropdowns, dialogs, toasts) keep shadcn's stock shadows. The one translucency is the sticky filter row: background at 95% with a 2px backdrop blur, which is functional, not decorative.

### Named Rules
**The Rules Over Shadows Rule.** Separate with 1px rules and tonal steps. A new surface earns no shadow unless it floats above the page.

## Shapes

Crisp, not pillowy. Status pills, chips, the version chip, and filter segments use 3px corners. Scenario tags, inputs, callouts, the spec editor, rail items, and diff tables use 4.5px. Buttons, banners, the running panel, and the catch spotlight use 6px. Dialogs use 9px. Fully round shapes are reserved for the eyelet ring, timeline station marks, status dots, avatars, and the progress bar.

The eyelet is the world's one decorative atom: a status icon inside a 22px ring with a 1.5px border in the band foreground at 60% opacity, echoing a tag's punched hole. It appears on the FAILED and UNDER TEST bands (28px on FAILED) and at page scale on the lockout banner (48px ring, 2px border). The wordmark glyph is an authored SVG tag with an eyelet.

Dashed outlines mean "no verdict": the ERROR void tag and empty-filter states.

## Components

### Buttons
Standard shadcn buttons, kept recognizable.
- **Shape:** gently squared (6px), 32px tall at default size, 14px medium label, 16px icons.
- **Primary:** Notice Blue fill with tag-stock text; hover drops the fill to 80%, press nudges down 1px.
- **Outline / Ghost:** card fill with a 1px rule, or no fill, for secondary actions (Open agent, Rollback).
- **On a lockout band:** outline in band foreground at 60% over a transparent fill, plus a solid band-foreground button with lockout-red text for the one forward action (View failing run).
- **Destructive:** only on the rollback confirm and Reject.

### Chips
- **Status pill:** 3px corners, 1px border, 12px semibold label with a 12px icon (14px label, 16px icon at large size). Failed and blocked are solid; live/passed, running, error, and draft are tinted with matching ink and border. The running icon spins.
- **Data chips:** quiet-surface fill, mono 12px, 3px corners (policy names, tool names in the trace).
- **Critical marker:** inside the FAILED band, a white chip with fail-red text, triangle icon, "Critical".

### Cards / Containers
- **Corner Style:** 4.5px for tags and inner blocks, 6px for page-scale panels.
- **Background:** card white on tag stock; quiet surface for nested quotes and JSON.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px rule; fail-red for failed tags, dashed warn border for void tags, fail border for the catch spotlight.
- **Internal Padding:** 12px in tags, 16-20px in panels.

### Inputs / Fields
- **Style:** shadcn inputs with the input rule stroke and 4.5px corners; caret in Notice Blue.
- **Focus:** 2px Notice Ring outline, 2px offset.
- **Spec editor:** a card with a quiet-surface header bar (file name in mono 13px, validity state, and the line budget "N / 20 lines" which turns warn when over). A quiet-surface line-number gutter with a 1px right rule sits beside a borderless mono 14px textarea, both locked to a 22px line grid so numbers align exactly. Error lines get a fail-subtle full-width highlight and fail-red gutter numbers; changed-since-live lines get a 2px Notice Blue gutter mark.

### Navigation
- **Rail:** 232px Rail Navy field, 16px padding. Wordmark (Archivo 700, 18px) with the tag glyph. Nav items are 14px medium with 16px icons, 4.5px corners; inactive in rail muted with a 60% rail-active hover, active on rail active with white text. Approval count badge in a 3px-cornered white chip with navy ink. Footer: production status dot + word, persona, theme toggle.
- **Mobile:** the same field as a sticky top bar; nav collapses to icons below 640px.
- **Filters:** a segmented control in a card-white 1px-ruled track; the active segment fills Notice Blue. Counts are part of the label ("Failed 1", "Not graded 20").

### Scenario Tag (signature)
An article with a band on top and ruled fields below.
- **Failed:** solid fail-red band with the 28px eyelet, FAILED in status-word caps, tag code and Critical marker right. Body: scenario name (title), End state row (field label + 22px FAIL) above the failed assertions (mono expected · got, "got" in fail red; three visible, "+N more"), then the Reply check row in quiet ink, the reply quote clamped to one line, the disagreement callout, a two-row mini diff, and "View run" in Notice Blue.
- **Passed:** no band. Circle-check + PASSED in pass green, code right, scenario name, one muted toggle line "End state pass · Reply pass" that expands the assertion list.
- **Running:** caution-yellow band with the running sheen and spinning dashed ring, UNDER TEST, skeleton lines in the body.
- **Error (void tag):** dashed warn-border outline, no band, triangle + ERROR in warn amber, "not graded" beside it, compact like a passed tag. A toggle reveals the run's error message in mono. Errors are never shown as FAIL.
- **Motion:** on a running-to-verdict transition only, a quarter-turn flip on X (420ms, ease-out-quart) with the face swapping at the edge-on frame (45%). Cold loads of finished gates never animate.

### Verdict Banners
- **Lockout (Blocked):** solid lockout-red, 20px padding, 6px corners, the 48px eyelet with a padlock, "BLOCKED." in verdict caps beside the serving sentence, a sub-line at 90% opacity naming failures, critical count, and not-graded count.
- **Live:** pass-subtle fill with a pass border, circle-check, "LIVE." in pass green. Quieter than blocked on purpose.
- **Gate error:** warn-subtle fill with a warn border, triangle, a plain sentence that says no version changed.
- **Motion:** drops 8px with a 4px blur clearing (520ms, ease-out-expo), only when the page watched the gate leave running.

### Catch Spotlight
A two-column panel with a fail border. Left: the scenario name at headline size, the agent's reply in a quiet box, then End state (solid fail block, FAIL in verdict caps) beside Reply check (outlined block, muted verdict). Right on a 40% quiet tint: expected/got cards in mono and the mini diff.

### Run Trace
- **Timeline:** a 2px rule line with fixed 24px round station marks per event (outlined for model calls, accent ring for tool calls, solid fail for policy blocks, solid caution yellow for approvals, solid warn for errors). Relative timestamps (`+0.84s`) in mono on the left, latency and cost right-aligned in mono so they scan as a column.
- **Twin diff:** per changed table, a mono 12px table with a leading glyph column (`+`, `−`, `~`) so it reads without color. Added, removed, and changed rows take their diff tints; changed cells take diff-cell with `before → after`. Untouched rows for the same account show as muted context rows. Tables with only changed rows trim to key columns plus changed columns.

### Counters Strip
One row between 1px rules: "46 tests · 5 packs · 0 untested tools" with 36px numerals and 15px quiet labels; untested turns warn with a triangle. Right side: worded verdict counts (icon + 28px numeral + "passed" / "failed" / "not graded" / "running"), each numeral ticking (180ms) only while running. Explanatory one-liners sit underneath. This strip is the only big-number moment on any screen.

## Do's and Don'ts

### Do:
- **Do** pair every status with a shape-distinct lucide icon, a word, and its ink.
- **Do** reserve solid fills for FAILED and BLOCKED; keep passed tags to icon + word.
- **Do** put End state above Reply check, at full weight, with Reply check in quiet ink.
- **Do** show proof beside each verdict: expected · got in mono and the mini diff on the tag.
- **Do** render infrastructure errors as dashed "not graded" void tags and label pass rate "(graded)" when errors exist.
- **Do** use the status-word setting (Archivo wdth 78, 750, caps, +0.04em) for every status word, never below 14px.
- **Do** keep motion to 150-200ms state transitions, plus the tag flip and banner drop on live transitions only; under reduced motion every duration collapses to zero and verdicts snap.
- **Do** start every animated element from a visible state.

### Don't:
- **Don't** use Notice Blue for a status or a safety ink for a button.
- **Don't** show running and warn amber in the same component.
- **Don't** add shadows to tags, panels, or banners.
- **Don't** add gradients other than the running sheen, gradient text, glass, glow, or purple.
- **Don't** add hero-metric card rows; counts live in the one counters strip.
- **Don't** use colored side stripes thicker than 1px on cards, callouts, or alerts. The 2px gutter mark in the spec editor is a line marker inside a code gutter, not a card stripe.
- **Don't** use emoji or Unicode glyphs as icons. The `+ − ~` diff glyphs are data and are fine.
- **Don't** set prose or labels in monospace.
- **Don't** re-sort tags or groups while a gate is running.
