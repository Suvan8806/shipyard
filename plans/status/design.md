# Design lane: Departures overhaul (branch design-overhaul)

Direction: "Departures", a split-flap departures board (contract in .impeccable/surfaces/app-dash-agents-name-versions-v-page-tsx.md).

## Done (pushed)
- Tokens/type/shell: board-black rail, signal yellow wayfinding, lamp status colours; Sofia Sans Condensed + Atkinson Hyperlegible (+ Mono); Flap split-flap component.
- Gate board: verdict boards (BLOCKED/LIVE/ERROR/RUNNING flaps), lamp strip, catch spotlight, departures-row test list.
- Agent page + spec editor (board-black editor, line-budget flap, pass-rate-by-version chart).
- Agents fleet board, library, approvals, audit, run trace, states (404/error/empty), stress lab + diff (token pass).
- Screenshots: design/shots/overhaul/before, design/shots/overhaul/after (1440x900, 1280x720, 375x812, light + dark).

## In progress
- Landing page at / and in-app onboarding captions (user request).

## Next
- DESIGN.md rewrite for Departures; finish review.

## STOPPED AT (paused for laptop close)
- Done + pushed: everything above, plus landing page at / (app/page.tsx, components/shipyard/landing/copy-command.tsx) and components/shipyard/onboarding.tsx (HowItWorksGuide + Caption), not yet wired in.
- Next, in order:
  1. Verify landing page renders (/, 1440 + 375), screenshot.
  2. Wire HowItWorksGuide above the table in components/shipyard/agents/agents-list.tsx (main return ~line 285).
  3. Captions: gate board header ("Each row is one test run on a throwaway copy of the database"), agent header ("Edit the spec, then Deploy: the gate decides if it ships"), run trace h1 ~line 242 ("Every model call, tool call and the exact rows the agent changed").
  4. "?" help link in shell nav to /.
  5. npm run build, push, DESIGN.md rewrite, finish review.
