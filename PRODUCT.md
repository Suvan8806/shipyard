# Product

<!-- impeccable:product-schema 1 -->

> Provenance: written by the design lane (a subagent with no live user channel) from the orchestrator's brief, `PRD.md` sections 1, 2, 10.5, 16, 17, 17b and `PLAN.md`. Every fact below is sourced from those documents; nothing here was confirmed in a live interview. Items marked *(inferred)* are the design lane's reading of the brief.

## Platform

web

## Users

- **Primary: Maya Ortiz, sole platform engineer at Lone Star Community Credit Union** (fictional, Austin TX). Nine teams want agents; each wires tools, prompts and logging differently. Her job: give every team one way to create an agent, and one gate that stops a bad agent from touching member accounts. She lives in the agent editor and the gate board, and reads run traces when something is blocked.
- **Secondary: team owners** at the credit union (Member Support, Collections, Card Services, Lending, Fraud Ops, Branch Ops) who own individual agents and approve risky actions.
- **Evaluating audience: HackTX 2026 judges** (NMC2 track "Build the Platform Behind the Agent"), watching a 3-minute live demo on a projector, and possibly opening the production URL on a phone.

## Product Purpose

Shipyard builds enterprise AI agents from one short YAML spec (≤ 20 lines). Shared parts are defined once and inherited by every agent: tools, model profiles, instruction blocks, policies and test packs. Every deploy runs its scenarios (about 35–45 tests per version) against **twins**: throwaway Postgres databases with the real schema, seeded per scenario. Shipyard checks the **end state of the data**; if it is wrong, the deploy is **blocked** and the previous version keeps serving.

Success: a bad agent version never reaches members, and the reason it was stopped is legible in one glance.

## Positioning

**One-liner:** Crash-test dummies for enterprise agents. Build an agent from one file, and it only ships once its actions are verified on a twin of your systems.

Existing eval tools grade what an agent *says* and which tools it *calls*. Shipyard grades what the agent *changed in the data*. The product shows this directly: on the bad deploy the reply-only check passes while the end-state check fails, and the twin diff shows the extra row.

## Operating Context

- Workflow: edit spec → Deploy → gate board (cards flip running → pass/fail) → live or blocked → read the run trace and twin diff → fix or roll back.
- Agents are also created and deployed from any MCP client (e.g. Claude Code); the dashboard gate board lights up for those deploys too.
- Surfaces (PRD 16): Agents list, Agent page (spec editor, scenarios, versions, chat), Gate board, Run trace with twin diff, Library, Approvals, Audit.
- Demo setting: a projector in a hackathon hall; legibility from the back of the room is a product requirement for the demo surfaces. *(from brief)*
- No auth: the header shows the persona "Maya Ortiz · Platform".

## Capabilities and Constraints

- Terms to use exactly: agent, spec, version, deploy, gate, gate board, twin, scenario, assertion, test pack, end state, reply check, live, blocked, running, rollback, policy, policy block, approval, run, trace, twin diff, profile (`fast`, `careful`), instruction block.
- Gate statuses: `running`, `live`, `blocked`, plus `draft`. Scenario results: running, passed, failed. The reply check is informational and never affects gate status.
- Test sources: `spec` (hand-written), pack name (`security`, `compliance`, `money-safety`, `read-only`, `escalation`), `generated`. Coverage flags untested tools.
- Run events: `model_call`, `tool_call`, `policy_block`, `approval`, `error`, each with tokens, cost, latency.
- Stack: Next.js 16 App Router, Tailwind 4, shadcn/ui (components in `components/ui/**`), Supabase, Vercel.
- Seeded history for the six extra agents is synthetic; everything triggered during the demo is real. The README says so.

## Brand Commitments

- Name: **Shipyard**. Fictional customer: Lone Star Community Credit Union.
- Personality: an enterprise trust tool. Calm, precise, confident. *(from brief)*
- Explicitly not: generic AI-SaaS purple gradients. *(from brief)*
- Status must be unmistakable in light and dark mode and colorblind-safe: color is always paired with an icon and a word. *(from brief)*

## Evidence on Hand

- Statistic: quality is the top blocker to production for 32% of 1,340 teams (LangChain, *State of Agent Engineering*, June 2026). **Unverified (PLAN task H4); do not render in product UI until verified.**
- Demo population (PRD 17b): 8 agents across 6 teams, synthetic version history, real traffic from a simulator.
- No customers, testimonials, benchmarks or pricing exist. Do not invent them.

## Product Principles

1. **The data is the verdict.** End state outranks the reply everywhere it appears; the reply check is shown, but quieter.
2. **Blocked is a safe outcome, not an error.** A block means the system worked; the previous version keeps serving, and the UI says so.
3. **Every claim is inspectable.** A pass or fail always links to the run, the assertions (expected vs actual) and the twin diff.
4. **Define once, inherit everywhere.** Shared tools, profiles, blocks, policies and packs are first-class and visible, not buried config.
5. **Legible at a distance.** Status reads from across a room before any detail does.

## Accessibility & Inclusion

- WCAG 2.2 AA contrast for text; status never conveyed by color alone (icon + word + color).
- Respect `prefers-reduced-motion`: card flips and banner entrances degrade to instant state changes.
- Works at 375 px phone width with 16 px gutters (judges may open it on a phone).
