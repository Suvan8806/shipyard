---
version: 1
slug: "app-dash-agents-name-versions-v-page-tsx"
primary_target: "app/(dash)/agents/[name]/versions/[v]/page.tsx"
related_targets: ["app/(dash)/agents/page.tsx","app/(dash)/runs/[id]/page.tsx"]
---

# Shipyard dashboard: Departures (complete overhaul)

Scope: every dashboard route (shell, agents fleet, agent page + spec editor, gate board, run trace + twin diff, library, approvals, audit, Stress Lab, version diff, empty/loading/error/404). Visitor mode: **Operate**. Audience: Maya Ortiz (platform engineer) at work; HackTX judges watching a projector from the back of a hall, and on phones. Task: know at a glance which agents are serving, what is under test, and why a version was stopped. Memorable moment: the gate board's 46 rows flap in one by one, then BLOCKED cascades across the verdict board in giant flap cells, Reply check PASS beside End state FAIL, and "v3 is still serving."

## Direction contract

THESIS: The agent fleet is a departures board: every version is a departure, the gate is the boarding check, and BLOCKED is a cancelled departure that never leaves the platform while the previous one keeps running. Refuses the category default of a grey shadcn admin table with small coloured pills where a reply grade and a data verdict weigh the same.

OWN-WORLD: Concourse. Matte board-black shell (rail + verdict boards) with paint-white flap letters; cool concourse-steel ground with white work surfaces in light, board-black ground in dark; signal yellow reserved for wayfinding (current nav, primary action, focus), lamp colours only for state (green on time/live, cyan boarding/running, red cancelled/blocked, orange delay/error). Sofia Sans Condensed heavy caps on flap cells and headings; Atkinson Hyperlegible Next for UI (read at distance); Atkinson Hyperlegible Mono for spec, assertions, diffs, money. 4px corners, hairline rules, lamp dots, no gradients, no glass.

STORY: The judge sees the fleet board of 8 agents with lamps, watches one Deploy turn into a boarding check where 46 test rows flip from TESTING to PASS/FAIL, sees BLOCKED cascade letter by letter, reads Reply check PASS (grey, small) against End state FAIL (red, huge) with expected ≤1 / got 2 and the +1 credits row, and understands members were protected because v3 is still serving.

FIRST VIEWPORT: Gate board: board-black rail left (wordmark, nav with yellow current marker, persona, lamp for production). Top: full-width verdict board (black, 2-row flap cells: BLOCKED in 64-80px red-lit cells; "v3 is still serving." in 28px paint white; actions right). Below: route line "support-agent v4 → gate" with counters as flap numerals (46 tests · 5 packs · 0 untested tools), passed/failed tallies, then the catch spotlight (End state FAIL dominant vs Reply check PASS quiet, proof on the right), then filter tabs and the test rows grouped by source as a departures list (code, name, source, reply, end state lamp + word).

FORM: Grounded candidate 6 of 7 (rail concourse split-flap departures board), assigned by roll; the dealt split-flap concourse challenger supplies the system grammar for the same world. seed:bd6e3600135c6575. Code-led (operate surface).

SIGNATURE: The split-flap cell: status words, version numbers and headline counters are set in individual board cells with a hairline split; when a value changes, the characters cascade through the alphabet and settle left to right (reduced motion: instant). Gate test rows flap in as they settle; the verdict lands as a cascade on the board.

RAISES: (japanese-high-density-web) density courage: the gate list packs 46 tests into ruled rows with short codes, no whitespace inflation. (rw-lexicon-shoulder-and-plate) colour quarantine: lamp colours appear only inside state cells and the verdict board, never as decoration. (terminal-yellow-wayfinding) one message per band, monumental number: the verdict board says one sentence and the version number is set large. (vertical-video-feed) one item owns the viewport: on a blocked gate the catch spotlight owns the first screen under the board. (labanotation) length is exact duration: run-trace events carry latency bars whose length is the measured latency.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Decisions recorded (no live user channel)

- Decision page not served: this ran as a subagent with no user channel; the assigned direction was built. Challenger verdicts: split-flap concourse = same world, merged as grammar; terminal yellow wayfinding = competitive (kept: one message per band); japanese high-density, lexicon, vertical feed, labanotation = declined (raises above).
- Light remains default (projector washes out large dark fields); the shell and verdict boards are board-black in both themes.
