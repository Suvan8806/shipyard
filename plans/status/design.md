# Design lane status

Updated: 2026-10-24 · Branch `design` · Worktree `shipyard-design`
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
