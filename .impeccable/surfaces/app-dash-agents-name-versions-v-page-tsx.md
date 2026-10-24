---
version: 1
slug: "app-dash-agents-name-versions-v-page-tsx"
primary_target: "app/(dash)/agents/[name]/versions/[v]/page.tsx"
related_targets: ["app/(dash)/runs/[id]/page.tsx"]
---

# Gate board (and the dashboard shell it lives in)

Scope: `/agents/[name]/versions/[v]` gate board, plus the run trace `/runs/[id]` it links to. Visitor mode: **Operate**. Audience: Maya Ortiz (platform engineer) at work; HackTX judges watching on a projector during the 60-second "catch" beat. Task: see in one glance whether a version shipped, and if not, exactly which data was wrong. Memorable moment: `Reply check: PASS` beside `End state: FAIL`, a second $25 credit row in the twin diff, and "Blocked. v1 is still serving."

Full specs for Lane D live in `design/direction.md`; tokens in `design/tokens.css`.

## Direction contract

THESIS: A deploy is an inspection, and every scenario is a tag hung on the version: quiet when it passes, loud when it fails, and the whole version locked out when the data is wrong. Refuses the category default of a grey dashboard of identical green/red badges where the reply grade and the data grade weigh the same.

OWN-WORLD: Inspection and lockout tags. Cool tag-stock ground, a committed Notice-blue shell rail and primary, ANSI-style safety inks (green, red, caution yellow) used only for state. Archivo with condensed bold caps for status words; Geist Mono only for spec, assertions, diffs and money. Crisp 6px corners, 1px rules, no gradients, no glass.

STORY: The judge sees cards flip from UNDER TEST to PASSED or FAILED, sees one FAILED tag whose reply line says PASS, reads expected ≤ 1 / got 2, sees the extra credits row, and understands the blocked banner means members were protected.

FIRST VIEWPORT: Left Notice-blue rail. Top: lockout banner (full width, blocked-solid, lock icon, "BLOCKED" in condensed caps, "v1 is still serving." at 28px, Back to editor / View failing run). Below: header row with agent + version + status tag, then counters "38 tests · 5 packs · 0 untested tools" at 36px numerals. Then a filter row (All / Failed / Critical) and the tag grid grouped by source, failed tags sorted first in each group.

FORM: Grounded candidate 5 of 7 (inspection and lockout tags), assigned by roll. seed:87eba0f94732cf64. Code-led (operate surface).

SIGNATURE: The scenario result as an inspection tag: an eyelet status icon, a status band in condensed caps (solid only for FAILED and BLOCKED), ruled fields "End state" (prominent) over "Reply check" (quiet), and the disagreement callout "A reply-only eval would have shipped this." The blocked banner is the same tag language at page scale: the lockout tag.

RAISES: (from variable-font-specimen) hierarchy by scale contrast: status words at 22px condensed caps against 12px field labels. (monochrome-product-marketing) every verdict sits beside its proof: expected/actual and the mini diff on the tag itself. (orienteering-map) one reserved ink per role: Notice blue is never a status. (cassette j-card) a visible budget: the spec editor shows "16 / 20 lines". (transit-diagram) the run trace is one vertical line with fixed-size station marks per event. (doujin-catalog) the grid repacks in whole tags, each with a short code (MS-03).

## Unresolved

- Decision round not run with a live user (design lane is a subagent). The orchestrator or user may re-roll; the challengers and verdicts are in plans/status/design.md.
- DESIGN.md is written at finish by the impeccable-documenter, after Lane D's build lands and the polish pass is done.
