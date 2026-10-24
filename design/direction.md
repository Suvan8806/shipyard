# Shipyard design direction

For: Lane D (dashboard builder), the orchestrator (applies tokens), and the W3 polish pass.
Companion files: `design/tokens.css` (paste-ready `app/globals.css`), `PRODUCT.md` (product truth), `.impeccable/surfaces/app-dash-agents-name-versions-v-page-tsx.md` (direction contract for the hero screens).

**Mode: Operate.** This is a working tool. Standard shadcn controls, standard navigation, standard tables. The world only lends four things: type, palette, density, and one signature move. If a choice below ever makes a control harder to recognize, the control wins.

---

## 1. The direction in one paragraph

**Inspection tags.** A deploy is an inspection. Every scenario is a tag hung on the version: quiet when it passes, loud when it fails. When the data is wrong the whole version gets a lockout tag, and the previous version keeps serving. The world gives us a cool tag-stock ground, a committed **Notice-blue** shell, **safety inks** (green, red, caution yellow) that are used *only* for state, and **condensed bold caps** for status words, the voice of a tag header. Everything else is calm, crisp and plain: 6px corners, 1px rules, no gradients, no glass, no glow.

What it refuses: the grey AI dashboard where every result is an identical green or red pill and the reply grade weighs as much as the data grade.

## 2. Principles that decide arguments

1. **Failures are loud, passes are quiet.** A failed tag gets a solid red band. A passed tag gets a green icon and word, nothing more. That asymmetry is what makes the one bad card findable from the back of a room, and it doubles as colorblind safety (ink weight differs, not just hue).
2. **End state outranks reply.** On every tag, the End state row comes first, at full size and weight. The Reply check row sits below it in muted type. Never the other way round, never side by side at equal weight.
3. **Never color alone.** Every status = icon + word + color. Icons differ in *shape* (circle, octagon, dashed ring, lock, triangle), so the status reads in greyscale.
4. **Notice blue is never a status.** Blue means "you can act here" (primary button, selection, link, focus). Green/red/yellow mean state and nothing else. Don't make a primary button green.
5. **Blocked is safe, not broken.** The blocked banner says what is protected ("v1 is still serving"), not just what failed.

## 3. Typography

| Role | Face | Setting |
|---|---|---|
| UI, headings, body, tables | **Archivo** (Google, variable `wght` 100–900, `wdth` 62–125) | normal width, 400 body / 600 labels / 700 headings |
| Status words (PASSED, FAILED, BLOCKED, LIVE, UNDER TEST) | Archivo, same family | `.status-word` utility: `font-stretch: 78%`, weight 750, caps, +0.04em |
| Spec YAML, assertions (expected/actual), diff cells, run ids, costs, token counts | **Geist Mono** (already loaded) | tabular, no ligatures |

Why Archivo: a grotesque built for both screen and print with a real width axis, so one family gives us a calm UI voice *and* the condensed tag-header voice without a second display face. It holds up at projector distance (open apertures, sturdy weights). Mono is used only for code, data and money, never as decoration.

**Apply in `app/layout.tsx` (orchestrator):**
```tsx
import { Archivo, Geist_Mono } from "next/font/google";
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// <html lang="en" className={`${archivo.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
// metadata: { title: "Shipyard", description: "Crash-test dummies for enterprise agents." }
```
Note: the current `globals.css` has `--font-sans: var(--font-sans)` (circular, so the app currently falls back to the browser default sans). `tokens.css` fixes this.

**Scale (fixed rem, ratio ~1.2, no fluid type):**

| Token | px | Use |
|---|---|---|
| `text-2xs` | 11 | micro labels only (tag codes like `MS-03`) |
| `text-xs` | 12 | field labels (`.field-label`), table meta |
| `text-sm` | 14 | dense table cells, secondary text, assertion lines |
| `text-base` | 15 | body |
| `text-lg` | 18 | tag titles (scenario name), panel titles |
| `text-xl` | 22 | status words on tags, section titles |
| `text-2xl` | 28 | page titles, banner sentence |
| `text-3xl` | 36 | gate header counter numerals |
| `text-4xl` | 48 | banner verdict word (BLOCKED / LIVE) at ≥1280px only |

Rules: headings `text-balance`; prose max 70ch; status words never below 14px; numbers always `tabular-nums` (applied to `table`, `.tabular`, `[data-numeric]`). No kicker/eyebrow labels above headings.

## 4. Color

### 4.1 Strategy
**Restrained + one committed field.** Neutrals are cool and slightly blue (tag stock). The shell rail is a committed Notice-blue field (navy in light mode, near-black navy in dark). Safety inks appear only where they carry state.

**Light is the projector theme** (projectors wash out dark UIs; the demo runs in light). Dark is fully supported via the existing `.dark` class (`next-themes` is installed; use `attribute="class"`, default `"light"`, toggle in the rail footer).

### 4.2 Roles (shadcn names, values in `tokens.css`)
| Token | Role |
|---|---|
| `--background` | page ground (cool off-white / navy-black) |
| `--card` | tags, panels, tables (pure white / lifted navy) |
| `--primary` | Notice blue: primary buttons (Deploy), selected tab, links, focus |
| `--muted`, `--muted-foreground` | quiet surfaces, secondary text (reply check row, meta) |
| `--accent` | hover/selected row tint (blue-tinted) |
| `--destructive` | destructive *actions* only (Reject, Rollback confirm). Not status. |
| `--border`, `--input`, `--ring` | 1px rules, inputs, focus ring |
| `--sidebar*` | the rail: `--sidebar` field, `--sidebar-foreground`, `--sidebar-muted` (new), `--sidebar-accent` active item |

### 4.3 Status system
Each status has 5 tokens: `--X` (text/icon on card), `--X-solid` (band/pill fill), `--X-solid-foreground`, `--X-subtle` (tinted surface), `--X-border`. Tailwind utilities come for free: `text-fail`, `bg-fail-solid`, `text-fail-solid-foreground`, `bg-fail-subtle`, `border-fail-border`.

| State | Applies to | Token | Lucide icon (shape) | Word | Treatment |
|---|---|---|---|---|---|
| Passed | scenario | `pass` | `CircleCheck` (circle) | PASSED / PASS | icon + word in `text-pass`; **no band** |
| Failed | scenario | `fail` | `OctagonX` (octagon) | FAILED / FAIL | **solid band** `bg-fail-solid`, white text |
| Running | scenario, version | `running` | `CircleDashed` + `animate-[running-ring]` (dashed ring, spinning) | UNDER TEST (tag) / Running (pill) | caution-yellow band with dark ink + sheen |
| Live | version | `pass` | `CircleCheck` | LIVE | pill: `bg-pass-subtle text-pass border-pass-border`; banner: see 7.1 |
| Blocked | version | `blocked` | `Lock` (padlock) | BLOCKED | always solid: `bg-blocked-solid text-blocked-solid-foreground` |
| Error | scenario, version | `warn` | `TriangleAlert` (triangle) | ERROR | `bg-warn-subtle text-warn` |
| Draft / none | version | `draft` | `PencilLine` | DRAFT / none | `bg-draft-subtle text-draft` |
| Untested tool | coverage | `warn` | `TriangleAlert` | "payments.defer has no test" | inline `text-warn` |

Colorblind notes: pass is shifted toward teal (hue 158) and fail toward orange-red (hue 27) to separate them for deutan/protan vision, but the real guarantee is shape + word + the solid-band asymmetry. `running` and `warn` share the amber family; they are never shown in the same component (a running tag has no warnings yet; warn appears in diffs, coverage and errors).

### 4.4 Contrast (checked, OKLCH → sRGB, WCAG 2.x)
Light: foreground/background 16.97 · muted-fg/background 6.26 · white on primary 9.66 · rail text 11.21 · pass on card 5.60 · fail on card 6.11 · white on fail band 6.11 · white on blocked 8.14 · running text on card 6.15 · ink on running band 9.46 · warn on card 6.27 · focus ring vs background 4.67.
Dark: fg/bg 16.53 · muted-fg/card 7.15 · primary-fg/primary 9.10 · pass 8.71 · fail 6.63 · white on blocked 6.59 · running 10.01 · warn 9.24.
All text pairs pass AA (≥4.5:1); most pass AAA.

### 4.5 Twin diff colors
`--diff-add` / `--diff-add-bg` (green), `--diff-remove` / `--diff-remove-bg` (red), `--diff-change` / `--diff-change-bg` (amber), `--diff-cell` (the exact changed cell, stronger than its row). Rows also carry a leading `+` / `−` / `~` glyph column in mono, so the diff reads without color.

## 5. Space, radius, elevation

- **Spacing:** Tailwind's 4px scale. Rhythm: 4 (inside chips) · 8 (icon-to-label, field gaps) · 12 (inside tag sections) · 16 (tag padding, page gutters on mobile) · 24 (between groups, desktop gutters) · 32 (between page sections) · 48 (above the first heading on wide screens). More space above a heading than below it.
- **Radius:** `--radius: 6px`. Chips 3px, buttons/inputs 4.5px, tags/cards/panels 6px, dialogs/sheets 9px. Pills for status are `rounded-sm`, not fully round: tags are crisp.
- **Rules over shadows.** Cards are `border bg-card`, no shadow at rest. Only overlays (popover, dropdown, dialog, toast) get a shadow, with offset and soft blur: `0 8px 24px -8px oklch(0.21 0.025 255 / 0.18)`. No colored halos, no hard offset shadows.
- **No colored `border-left` stripes** on cards, callouts or alerts (thicker than 1px). Status lives in the band and the icon, not a side stripe.
- Density: tables at `py-2.5` rows (40px) on desktop. Tags ~ 240–280px tall when failed, ~120px when passed (passed tags collapse their detail).

## 6. Motion

One authored moment: **the verdict landing on a tag.** Everything else is a 150–200ms state transition. No page-load choreography.

| Moment | Spec | Token |
|---|---|---|
| Tag: running → verdict | quarter-turn flip on X, 420ms ease-out-quart, swap content at the midpoint (45%). Stagger is natural (results arrive over ~8 s), do not add artificial stagger. If 40 simultaneous flips look busy in rehearsal, switch to `band-sweep` (status band fills left→right, 420ms ease-out-expo). | `animate-tag-flip` / `animate-band-sweep` |
| Running indicator | dashed ring icon rotates 1.1s linear; band gets a slow sheen (1.6s). The card itself never pulses. | `animate-running-ring`, `running-sheen animate-running-sheen` |
| Failed tag after flip | none extra. The solid band is the emphasis. No shake. | – |
| Blocked / Live banner | drops 8px with blur clearing, 520ms ease-out-expo, fired once when gate status leaves `running`. Lands ~150ms after the last tag flips. | `animate-banner-drop` |
| Header counters (passed/failed) | numeral ticks up 180ms per change | `animate-counter-tick` |
| Elapsed timer | plain text update each second, no animation | – |
| Hover/press | color/background 150ms; buttons `active:translate-y-px` | `--dur-fast` |

**Reduced motion:** `tokens.css` zeroes every duration and forces animations to a single instant frame under `prefers-reduced-motion: reduce`. The verdict still changes (band, icon, word); it just snaps. Running shows the static dashed ring + "UNDER TEST" word. Every animated element must start from a visible state (no `opacity: 0` initial frames), so nothing ever disappears if animation is off.

Implementation tip: key the tag's animation on the status change, e.g. `<div key={status} className={status !== 'running' ? 'animate-tag-flip' : ''}>`, so it plays exactly once per transition and not on first render of an already-finished gate (for already-finished gates loaded cold, render without the animation class).

---

## 7. Screens

### 7.0 Shell (`app/(dash)/layout.tsx`)
- **Desktop (≥1024px):** left rail 232px, `bg-sidebar text-sidebar-foreground`, full height. Top: wordmark "Shipyard" (Archivo 700, 18px) with a small tag glyph (a 14px rounded rect with an eyelet circle, authored SVG, `currentColor`). Nav: Agents, Library, Approvals (count badge `bg-sidebar-primary text-sidebar-primary-foreground`, 11px), Audit. Active item: `bg-sidebar-accent`, 2px inset left marker is fine *inside the rail* (it's navigation, not a card). Footer: production status line ("Production · shipyard.vercel.app" with a green dot + word "Up"), theme toggle, persona "Maya Ortiz · Platform".
- **Main:** `bg-background`, content max-width 1440px, gutters 24px (desktop) / 16px (mobile).
- **Mobile (<1024px):** rail becomes a 56px top bar in the same `bg-sidebar` field: wordmark left, a `Sheet` menu right. No horizontal scroll anywhere; tables become stacked rows (7.3).

### 7.1 Gate board `/agents/[name]/versions/[v]` (hero)

Vertical order, desktop 1440×900 first viewport:

**A. Verdict banner (only when status ≠ running).** Full width of the main column, directly under the page top, 20px padding, `rounded-lg`.
- Blocked: `bg-blocked-solid text-blocked-solid-foreground`. Left: `Lock` icon 28px. Then `BLOCKED` as `.status-word text-4xl` (48px; `text-3xl` below 1280px), then the sentence **"v1 is still serving."** at `text-2xl` weight 500 on the same baseline row (wraps below on mobile). Sub-line at `text-sm` at 85% opacity of the band foreground: "2 of 38 tests failed · 1 critical · end-state check". Right-aligned actions: `Back to editor` (secondary button rendered as white/outline on the band) and `View failing run` (white solid button with blocked-colored text). Copy uses the real `current_version`: `Blocked. v{current_version} is still serving.` If `current_version` is null: "Blocked. Nothing was deployed."
- Live: `bg-pass-subtle text-foreground border border-pass-border`. `CircleCheck` 28px in `text-pass`, `LIVE` as `.status-word text-pass`, sentence "v{v} is now serving." Actions: `Open agent`, `Rollback to v{prev}` (ghost). Quieter than blocked on purpose: success is the expected outcome.
- `role="status"` + `aria-live="polite"` on the banner container so screen readers announce it.

**B. Header row.** Left: breadcrumb `Agents / support-agent` (text-sm muted), then title `support-agent` `text-2xl` 700 with version tag `v2` (mono, `bg-muted rounded-sm px-1.5`) and the version status pill. Right: elapsed `0:41` (mono, ticking while running), total cost `$0.0312`, pass rate `95%` (mono). While running, show "Running 23 / 38" instead of pass rate.

**C. Counters strip.** One row, separated by `·` in muted: **`38` tests · `5` packs · `0` untested tools**, numerals `text-3xl` 700 tabular, labels `text-base` muted. When untested > 0, that segment turns `text-warn` with `TriangleAlert` and becomes a button that scrolls to a coverage note ("payments.defer has no test that covers it"). Right side of the strip: passed / failed / running mini-counts as icon + number (`CircleCheck 36`, `OctagonX 2`, `CircleDashed 0`). This is the only place a "big number" appears; there is no hero-metric card.

**D. Filter row.** shadcn `Tabs` (or toggle group): `All 38` · `Failed 2` · `Critical 1`. Plus a "Group by source" on by default. Sticky under the header on scroll (`top-0 bg-background/95 backdrop-blur-[2px]` is acceptable here because it's functional).

**E. Tag grid, grouped by source.** Group order: `Spec` (hand-written), then packs in fixed order `money-safety`, `security`, `compliance`, `escalation`, `read-only`, then `Generated`. Group header: name in `text-lg` 600 + count + group mini-status (e.g. "7 · 1 failed" with fail icon). Within a group: failed first, then running, then passed (re-sort only when a tag finishes, never while the user hovers). Grid: `grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3`; repacks in whole tags. Passed tags are compact (single block), failed tags span the full width of their group row on ≥1280px (`md:col-span-2`) so the catch has room.

**The scenario tag (component `ScenarioTag`, the signature):**
```
┌──────────────────────────────────────────────────────────┐
│ ◉ FAILED                                   MS-03 · crit  │  ← status band (solid only for FAILED; running = yellow band)
├──────────────────────────────────────────────────────────┤
│ second-credit-this-month                                  │  ← text-lg 600; description below, text-sm muted, 1-line clamp
│ Member asks for a second goodwill credit within 30 days.  │
│                                                          │
│ END STATE      ✕ FAIL                                     │  ← field-label + status icon/word at text-xl .status-word, text-fail
│   credits for A-100 · expected ≤ 1 · got 2                │  ← mono text-sm; "got 2" in text-fail weight 600
│ REPLY CHECK    ✓ PASS                                     │  ← field-label + text-sm status in text-pass, muted row
│   "Done! I've applied a $25 credit to your account…"      │  ← text-sm muted, roman (no italics), 1-line clamp, in quotes
│                                                          │
│ ┌ A reply-only eval would have shipped this. ┐            │  ← disagreement callout (only when reply PASS and end state FAIL)
│                                                          │
│ credits  + A-100  $25.00  "goodwill credit"   2026-10-24  │  ← mini diff: mono text-sm on bg-diff-add-bg, "+" glyph column
│                                       View run →          │  ← link, primary color
└──────────────────────────────────────────────────────────┘
```
- The eyelet: the band's leading icon sits in a 22px ring (1.5px border in band foreground at 60%), echoing a tag's punched hole. That ring is the one decorative atom of the world.
- Band text: `.status-word text-xl` (22px). Right side of band: tag code `MS-03` (pack abbreviation + index; `SP` spec, `MS` money-safety, `SE` security, `CO` compliance, `ES` escalation, `RO` read-only, `GN` generated) in mono 11px, and `crit` when any failed assertion is critical (`TriangleAlert` 12px + "Critical").
- Passed tag: no band. Top row = `CircleCheck` + `PASSED` (`.status-word text-base text-pass`), code on the right. Then the scenario name. End state / reply check collapse into one muted line: "End state ✓ · Reply ✓". Expand on click for details. Height ~112px.
- Running tag: yellow band `bg-running-solid text-running-solid-foreground running-sheen animate-running-sheen`, `CircleDashed` spinning, word `UNDER TEST`. Body shows name + description + a skeleton line for results (shadcn `Skeleton`).
- Error tag: `bg-warn-subtle` band with `TriangleAlert` + `ERROR`, message in mono.
- Failed assertions list: every failed assertion as one line `table.column predicate · expected X · got Y`. Up to 3 visible, "+2 more" disclosure.
- **Disagreement callout:** only when `reply_check.passed && status === 'failed'`. A full-width chip inside the tag: `bg-fail-subtle text-fail border border-fail-border rounded-md px-3 py-2 text-sm font-semibold`, `OctagonX` 14px + the sentence **"A reply-only eval would have shipped this."** No left stripe. On the gate header, when ≥1 tag has this disagreement, add a one-line note under the counters: "1 test passed the reply check but failed on the data."
- Mini diff: render at most 2 rows inline from `diff` (prefer `added` rows on the table named in the failed assertion). Format: `table  +  key  amount  note  date`, mono, money right-aligned with 2 decimals. "View full diff →" goes to the run trace's diff panel anchor.
- A11y: tag is an `<article aria-labelledby>`; the band text is real text (not only an icon); status changes announce via one shared live region in the header ("second-credit-this-month failed"), not per tag.

**Empty/edge states:** no results yet → 6 running tags with skeleton bodies and "Spinning up twins…" in the header; gate `error` → warn banner "The gate couldn't finish. No version was changed." + Retry; 0 packs → counter reads "0 packs" and the strip suggests "Add test_packs to the spec".

**Projector check:** from 6 m, the banner word, the counters and the FAILED band must read. Rehearse at 1280×720 (typical projector) with browser zoom 110%.

### 7.2 Run trace `/runs/[id]`

Two columns ≥1280px: timeline 7/12, twin diff 5/12 (sticky). Stacked below 1280px: timeline first, diff after (with a "Jump to twin diff" link at top).

**Header:** run id (mono), agent + version link, mode tag (`scenario` / `live`), scenario name link back to its gate tag, outcome (status pill), then totals row: `Tokens 4,812 in / 611 out` · `Cost $0.0041` · `Latency 6.2 s` · `Steps 9` (mono numerals).

**Timeline (the transit-line raise):** one vertical 2px line (`bg-border`) at x=20px; each event is a fixed-size 24px station mark on the line with its icon; content to the right.
| Event | Icon | Mark | Content |
|---|---|---|---|
| `model_call` | `MessageSquareText` | `bg-card border` ring | profile + model (mono), tokens in/out, cost, latency; collapsible prompt/response |
| `tool_call` | `Wrench` | `bg-accent` ring in primary | `accounts.apply_credit` (mono, 600), args and result as collapsible JSON (`<details>`, mono 13px, `bg-muted rounded-md p-3`); writes get a small `writes credits` chip |
| `policy_block` | `ShieldX` | solid `bg-fail-solid` mark | the reason sentence in `text-fail` 600 ("maxAmount: 500 > 25"), policy name chip. Card gets `bg-fail-subtle` |
| `approval` | `UserCheck` | `bg-running-solid` mark | requested / approved / rejected word + approver |
| `error` | `TriangleAlert` | `bg-warn-solid` mark | message mono |
Right edge of each row: latency and cost in mono muted, right-aligned, so costs scan as a column. Timestamps as `+0.84s` relative to run start.

**Twin diff panel:** title "Twin diff" + subtitle "What this run changed in its twin database" (muted). Toggle (segmented): `Changes` | `Before` | `After`. Per table that changed, a section: table name (mono 600) + counts `+1 −0 ~0`. Rows in a compact table with a leading glyph column:
- added: `+` and row `bg-diff-add-bg`, glyph `text-diff-add`
- removed: `−` and `bg-diff-remove-bg`, glyph `text-diff-remove`; values stay legible (no strikethrough)
- changed: `~` with `bg-diff-change-bg`; the changed cells (`columns[]`) get `bg-diff-cell` and show `before → after` in mono
For the demo, the `credits` table shows the existing first credit as context row (no tint, muted) above the new `+` row, so "a second $25 credit" is visible as two rows with the second one highlighted. If the run is `live` mode (no diff), hide the panel and let the timeline take full width.

### 7.3 Agents list `/agents`
- Page title "Agents" `text-2xl` + count; right: `Simulate traffic` (secondary) and `New agent` (primary, opens editor; MCP hint text below: "or create one from any MCP client").
- shadcn `Table`: Name (600; team underneath in `text-xs` muted) · Live version (`v3` mono or "none") · Status pill (live/blocked/running/draft per 4.3; blocked pill is solid) · Pass rate (mono, right-aligned) · Avg cost / run (`$0.004`, mono right) · Updated (relative, muted) · row action `Deploy` (ghost button, text only).
- Rows link to the agent (`hover:bg-accent`, full-row click, keyboard focusable). Blocked rows show the blocked pill; nothing else turns red.
- Optional filter by team (select) above the table.
- Mobile: each row becomes a stacked block: name + status pill on line 1, team · live version · pass rate · cost on line 2.
- Empty state: "No agents yet. Create one from a 16-line spec, or ask Claude Code: 'create a support agent and deploy it.'" with the New agent button.

### 7.4 Agent page `/agents/[name]` (spec editor)
- Header: name `text-2xl`, team + owner muted, live version pill, actions: `Deploy` (primary; disabled while invalid with tooltip "Fix 2 errors to deploy"), `Generate tests` (secondary).
- Layout ≥1280px: editor 7/12 left, side panel 5/12 right with Tabs: Scenarios · Versions · Chat. Below 1280px stacked.
- **Editor:** card with a header bar: file name `support-agent.yaml` (mono 13px), validation state on the right (`CircleCheck Valid` in `text-pass`, or `OctagonX 2 errors` in `text-fail`), and the **line budget** "16 / 20 lines" (mono muted; turns `text-warn` above 20). Body: line-number gutter (mono 13px, `text-muted-foreground`, right-aligned, `bg-muted`, 1px right rule) + textarea (mono 14px, line-height 22px, `bg-card`, no resize handle, `spellcheck=false`). The gutter and textarea share line-height exactly so numbers align. Error lines: gutter number in `text-fail` 600 and a full-width `bg-fail-subtle` line highlight behind the text (absolutely positioned div at `top = (line-1) * 22px`). Changed-since-live lines get a 2px `bg-primary` mark in the gutter (this is the line the judge edits; it makes the edit visible on stage).
- **Errors list** under the editor: each `path` (mono, e.g. `tools[3]`) + message, clickable to focus the line.
- Inherited parts: under the editor, a read-only row of chips for `profile: careful`, `inherit: brand-tone, compliance, escalation`, `test_packs: …`, each linking to `/library`. This makes "define once, inherit everywhere" visible.
- Versions tab: list with status pill, pass rate, date, "Gate board →" link; `Rollback` on the live row (confirm dialog, destructive styling only on the confirm button).

### 7.5 Library, Approvals, Audit (lighter touch)
- Library: three sections (Tools, Profiles, Instruction blocks, Test packs). Tool rows, not icon-card grids: name (mono 600), description, params (mono muted), **policy chips** (`bg-muted text-foreground rounded-sm text-xs px-1.5`, `Shield` icon 12px: "max $25", "1 per run", "needs approval", "no external w/ account data"). Test packs show template count and which tools they require.
- Approvals: table with Approve (primary) / Reject (outline destructive); optimistic + toast.
- Audit: table, mono timestamps, event type as a neutral chip, gate events use the status pills.

## 8. Copy rules
- Sentence case everywhere except status words.
- Exact terms: "end state", "reply check", "twin", "gate board", "blocked", "live", "test pack". Not "eval run", "sandbox", "pipeline".
- Banner sentences end with a period: "Blocked. v1 is still serving." / "Live. v2 is now serving."
- Money: `$25.00` in diffs, `$0.0041` for run cost (4 decimals under $0.01).
- Errors say problem + recovery: "Profile 'carefull' doesn't exist. Use fast or careful."

## 9. Don'ts (the craft floor, as it applies here)
- No gradients (except the functional running sheen), no gradient text, no glassmorphism, no glow, no purple.
- No hero-metric card rows; counters live in one strip.
- No eyebrow/kicker labels above headings.
- No colored side stripes on cards/callouts/alerts.
- No emoji or Unicode glyphs as icons (lucide only, one stroke weight: 1.75 for 16–20px, 2 for ≤14px). The `+ − ~` diff glyphs are data, not icons, and are fine.
- No monospace for prose or labels.
- No modal where inline works (rollback confirm is the one dialog).
- Theme the browser surfaces: selection, caret, focus ring, scrollbars (done in `tokens.css`).
