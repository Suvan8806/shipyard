# Design lane status

Updated: 2026-10-24 (W3 polish pass done) · Branch `design` · Worktree `shipyard-design`
Ran Impeccable `init` (wrote PRODUCT.md) and its direction round (`concept-seed --scope direction --mode operate`, seed:87eba0f94732cf64).

## Produced
| File | What |
|---|---|
| `PRODUCT.md` | Product truth for Impeccable: users, purpose, positioning, terms, principles, a11y. Inferred from PRD/PLAN/brief (no live interview; labeled in the file). |
| `.impeccable/surfaces/app-dash-agents-name-versions-v-page-tsx.md` | Direction contract for the gate board + run trace (THESIS, OWN-WORLD, STORY, FIRST VIEWPORT, FORM, SIGNATURE, RAISES). Read by the polish pass and the finish reviewer. |
| `design/direction.md` | The spec Lane D builds against: principles, type, color roles, status system, spacing, motion, and per-screen specs (shell, gate board, scenario tag, run trace + twin diff, agents list, spec editor, library/approvals/audit), copy rules, don'ts. |
| `design/tokens.css` | Paste-ready replacement for `app/globals.css`. Keeps every shadcn token; adds `--pass/--fail/--blocked/--running/--warn` (each with `-solid`, `-solid-foreground`, `-subtle`, `-border`), `--draft`, `--diff-*`, `--sidebar-muted`, type scale, radius, motion keyframes, reduced-motion, themed selection/caret/focus/scrollbars, and `status-word` / `field-label` / `running-sheen` utilities. Compiled successfully with the repo's Tailwind 4 (`@tailwindcss/node`). |

No DESIGN.md yet, on purpose: Impeccable writes DESIGN.md + `.impeccable/design.json` at finish (via the `impeccable-documenter` agent) from the built screens, not before.

## Direction: "Inspection tags"
- Fonts: **Archivo** (UI + condensed status caps via its `wdth` axis) + **Geist Mono** (spec, assertions, diffs, money).
- Palette: cool tag-stock ground, committed **Notice-blue** rail and primary, safety inks only for state (pass teal-green, fail red, blocked deep red solid, running caution yellow, warn amber). Light is the projector theme; dark fully specified. All text pairs AA (most AAA).
- Signature: the scenario result as an inspection tag. Failures get a solid band, passes stay quiet. End state row above and louder than the reply check row. Blocked banner = the lockout tag at page scale.

## Direction round (no live user: subagent, so the decision page was not served)
Grounded candidates, by resonance: 1 railway block signalling · 2 split-flap departures board · 3 crash-test report sheets · 4 bank check security printing · **5 inspection & lockout tags (assigned by the roll, built)** · 6 ledger reconciliation statement · 7 Texas highway guide signs.
Challenger verdicts (all declined; one discipline taken from each, recorded as RAISES in the brief): variable-font-specimen (scale-contrast hierarchy) · monochrome-product-marketing (verdict next to proof) · orienteering-map (one reserved ink per role: blue is never a status) · cassette j-card (visible budget: "16 / 20 lines") · midnight-transit-diagram, competitive on the trace only (fixed-size station marks on one line) · doujin-catalog (whole-tag repacking + short codes like MS-03).
If the user wants a different world, re-roll with: `impeccable concept-seed --scope direction --mode operate --from seed:87eba0f94732cf64` (then `--kind reroll`).

## Lane D: change now (cheap, saves rework)
1. Use the **token utilities**, never raw Tailwind colors: `text-pass`, `bg-fail-solid text-fail-solid-foreground`, `bg-blocked-solid`, `bg-running-solid`, `bg-diff-add-bg`, etc. Until O0 applies `tokens.css`, these classes won't resolve; that's fine, they light up on merge. Do **not** use `green-500/red-500/amber-500` or `destructive` for status.
2. Build one `StatusPill` and one `ScenarioTag` component used everywhere (agents list, versions tab, gate board) so status vocabulary stays identical.
3. Status icons from lucide by shape: `CircleCheck` pass/live · `OctagonX` fail · `CircleDashed` (spinning) running · `Lock` blocked · `TriangleAlert` error/warn · `PencilLine` draft. Always icon + word.
4. On the gate tag: **End state first and larger, Reply check second and muted.** Failed tags get a solid band; passed tags have no band and collapse.
5. Disagreement callout copy: "A reply-only eval would have shipped this." No colored left border.
6. Banner copy: `Blocked. v{current_version} is still serving.` / `Live. v{v} is now serving.` with `role="status"`.
7. Counters strip copy: "38 tests · 5 packs · 0 untested tools" (from `coverage`). PRD 10.5 says "6 packs" in one place; there are 5 packs (security, compliance, money-safety, read-only, escalation). Use the live count.
8. Animate only via `key={status}` + `animate-tag-flip` on transitions out of `running`; no animation on a cold load of a finished gate. No initial `opacity-0`.
9. Spec editor: shared 22px line-height for gutter and textarea; error line highlight + changed-since-live gutter mark; "N / 20 lines" budget.

## Orchestrator (O0): apply
1. Replace `app/globals.css` with `design/tokens.css`.
2. In `app/layout.tsx`: load `Archivo` with `axes: ["wdth"]` as `--font-archivo` (keep `Geist_Mono` as `--font-geist-mono`, drop `Geist`), add `suppressHydrationWarning`, set metadata title "Shipyard", and wrap in `next-themes` `ThemeProvider attribute="class" defaultTheme="light"`. Snippet in `design/direction.md` §3. (Fixes the existing circular `--font-sans: var(--font-sans)`.)

## Next steps: W3 polish pass (after Lane D merges and I4 wiring)
Run in this order, each with the Impeccable skill, against the deployed or `npm run dev` URL:
1. **`/impeccable critique app/(dash)/agents/[name]/versions/[v]/page.tsx`** with a blocked gate loaded (the demo state), at 1440×900 and 1280×720, light and dark, plus 390px. Then the run trace and the agents list.
2. **Fix the top issues** from the critique, checking each against `design/direction.md` (status asymmetry, End-state-over-reply weight, banner copy, counters strip, tag codes, diff glyph column).
3. **`/impeccable animate`** on the gate board: tag flip (or band-sweep fallback if 40 flips read busy), banner drop timed after the last flip, counter ticks, running ring; verify reduced-motion snaps.
4. **`/impeccable polish`** across shell, gate board, run trace, agents list, agent editor: states (hover, focus, disabled, loading skeletons, empty, error), tabular numerals, focus rings, mobile 390px with no horizontal scroll.
5. **`/impeccable audit`** quick a11y pass (contrast in both themes, live regions, keyboard path: editor → Deploy → gate board → View run).
6. Spawn **`impeccable-documenter`** to write `DESIGN.md` + `.impeccable/design.json` from the shipped screens.
7. Projector rehearsal: 1280×720, zoom 110%, read banner/counters/FAILED band from the back of a room.

## W3 polish pass (done, 2026-10-24)
Critique (dual-agent, snapshot in `.impeccable/critique/`): 24/40 before. Production data (support-agent v1: 25 pass / 1 fail / 20 infra errors) buried the single FAIL under 20 loud ERROR tags; the reply-vs-end-state moment never rendered (reply not graded); collections banner read "BLOCKED. 0 of 20 tests failed"; run trace had no verdict; twin diff clipped the balance cell.

Fixed (components/shipyard/**, app/layout.tsx only; no lib/api changes):
- Gate board: catch spotlight for any failure (disagreement > critical > first fail) with End state FAIL (solid) beside Reply check (Pass / Fail / Not graded), proof column (expected vs got, mini diff). Failing groups sort first once finished. Errors sort after passes.
- ERROR tags are now compact dashed "void" tags ("ERROR · not graded", message behind a disclosure): unmistakably not FAIL, same height as a pass.
- FAILED tag: 24px band word, 28px eyelet, Critical as a filled chip, solid red border, spans 2 columns from lg. End state / Reply check labels sit next to their verdicts.
- Counters: worded verdict counts at 24px ("25 passed · 1 failed · 20 not graded"); running count only while running; numerals tick while running.
- Filters: All / Failed (real fails only) / Critical / Not graded. Header: "Pass rate (graded)" when errors exist; durations over an hour as "7h 09m".
- Blocked banner: 48px BLOCKED, lock in an eyelet ring, sub-line "1 of 46 tests failed on the data · 1 critical · 20 not graded"; zero-fail blocks say "10 of 20 tests couldn't be graded (infrastructure errors) · the gate only ships what it can verify". Banner drops only on a running -> verdict transition.
- Tag flip: content swaps at the edge-on frame (45% of 420ms); instant under reduced motion.
- Run trace: verdict strip (End state FAIL / Reply check, failed assertions) from the gate result, Failed pill, sans title with muted pack prefix. Twin diff: changed-only tables show key + changed columns; money as −$25.00 (also in mini diffs).
- Agents list: metric cards -> one counters strip; row Deploy is an outline button; "Watch gate" in primary blue (status ink no longer used for actions). Agent header likewise.
- Spec editor stacks below 2xl so YAML lines aren't clipped at 1280/1440. Scenario quotes roman. text-[11px] -> text-2xs.
- Dark mode now survives reload (next-themes storageKey aligned with the rail toggle's `sy-theme`).

Screenshots: `design/shots/before/*` (production) and `design/shots/after/*` (local dev against the production API), 1440x900 / 1280x720 / 375x812 / full, plus dark gate + run.

Remaining: header Blocked pill duplicates the banner (kept as the version tag); dark-mode diff-cell "before" value is low contrast; "Pass rate (graded) 100%" beside BLOCKED on collections may need a word on stage; tag codes (MS-02) mean little to judges; no "re-run errored tests" action (needs an API).
