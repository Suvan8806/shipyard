# Shipyard PLAN

This is the single source of truth for state. The spec is in `PRD.md`, and per-lane instructions are in `plans/`.
**Only O0 edits this file.** Lanes report in `plans/status/<lane>.md`, and O0 copies status here.

## The pitch
- **One-liner:** Crash-test dummies for enterprise agents. Build an agent from one file, and it only ships once its actions are verified on a twin of your systems.
- **User:** Maya, the only platform engineer at Lone Star Community Credit Union; nine teams want agents.
- **Statistic:** 32% of 1,340 teams name quality as the top blocker to production (LangChain 2026). *Verify (H4).*
- **Wow moment:** a judge edits one line in the browser, clicks Deploy, and the reply check says PASS while the end-state check says FAIL. The twin diff shows a second $25 credit, and the deploy is **BLOCKED. v1 is still serving.**

## Demo script (build only what this needs)
1. `/library`: shared tools, policies, blocks, profiles.
2. Claude Code + the production MCP: "create a collections agent … deploy it." The gate board goes green: LIVE v1.
3. support-agent editor: change the credit line, then Deploy. The gate board shows `second-credit-this-month` failing (reply PASS, end state FAIL, diff), and the blocked banner appears.
4. `/runs/[id]` for `ignore-rules-attack`: policy_block, tokens, cost.
5. Rollback button and audit log (if time).

## Must / Nice / Cut
**Must:** spec validation · tool registry + 7 tools · policies · runtime loop with event logging + cost · PGlite twins + snapshot/diff · assertions · gate with majority vote · deploy async + polling · REST routes for the demo · hosted MCP (create, deploy, list, get_results, get_run) · dashboard: agents, agent editor, gate board, run trace · support-agent with 7 scenarios + collections-agent with 3 · live seed · **demo population: 8 agents across 6 teams, synthetic history, traffic simulator (fake members chatting for real)** · rate limit + admin token · replay cache · deployed on Vercel · backup video

**Nice (in order):** reply-only check column (do this first, it's high wow for little work) · library page · approvals page + approve executes · chat panel · rollback button · audit page · CLI · Supabase Realtime instead of polling · cost-per-profile chart · "download twin" dump

**Cut:** auth/accounts · drag-and-drop builder · real integrations · stdio MCP · multiple workspaces

## Sponsor tracks (fill in at the opening ceremony)
| Track | Qualifies via | Status |
|---|---|---|
| **NMC2 "Build the Platform Behind the Agent"** (1st AirPods Max Gen 2 · 2nd Apple Watch S12 · 3rd Echo Show 11) | the whole product | **the only track; confirmed** |

**Brief, verbatim:** "Building an AI agent often involves repeating the same setup: connecting tools, configuring models, writing instructions, and adding monitoring. How can a platform make that setup reusable so people can focus on what their agent should accomplish? Design and prototype a platform that lets users quickly create AI agents for enterprise grade use."

**Pitch mapping (say these words on stage):** reusable *tools* (registry + policies) · reusable *models* (profiles, provider swap via env, Groq today) · reusable *instructions* (blocks) · reusable *monitoring* (every run traced with cost) · plus reusable **testing** (test packs: 40 tests from one line) · "quickly create" = 16-line spec or one MCP prompt · "enterprise grade" = end-state deploy gate, approvals, rollback, audit.

Rule: don't add a sponsor API unless it shows up on screen in the demo script.

## Timeline (24 h; H0 = hacking starts)
```
H0 ─ W0 Foundation (O0, serial, ~1.5h) ───────────────┐
H1.5 ─┬─ Lane A runtime        (O-A)  ~5h              │  W1: four orchestrators in parallel,
      ├─ Lane B twins + gate   (O-B)  ~5h              │  each in its own git worktree
      ├─ Lane C API + MCP      (O-C)  ~4h              │
      ├─ Lane D dashboard      (O-D)  ~6h (mock data)  │
      └─ Lane E content (O0, after W0) ~2h, then O0 integrates as lanes land
H4  ─ I1 checkpoint: chat works on live (A+C+E)
H7  ─ I2 checkpoint: a full deploy gates live/blocked from REST (A+B+C+E). Prove the catch (E3)
H8  ─ I3 checkpoint: MCP create+deploy from Claude Code against production
H10 ─ I4 checkpoint: dashboard on real data (D wired)
H10–13  W2 nice-to-haves (2nd wave, same lanes) · H13–17 sleep
H17–20  W3 design polish (Impeccable) in parallel with QA + demo determinism
H20–24  W4 harden, backup video, /review, freeze, submit
```

## Dependency graph
```
W0 ──► A ──┐
   ├─► B ──┼──► I2 (gate e2e) ──► I3 (MCP prod) ──► W3 ──► W4
   ├─► C ──┤         ▲
   ├─► E ──┘─────────┘ (E's scenarios feed B's gate; E3 needs A+B)
   └─► D (mocks) ──────────────► I4 (wire to real API)
```
Lanes A, B, C, D and E code only against `lib/types.ts`, `lib/contracts/api.ts` and the stubs, so none of them waits on another to start.

## Lane matrix
| Lane | Orchestrator | Parallel? | Write surface | Risk | Verification |
|---|---|---|---|---|---|
| W0 Foundation | O0 | serial, first | config, contracts, migrations, repo, stubs | med | `npm run build`, deployed URL, `/api/health` |
| A Runtime | O-A | yes | `lib/library/{registry,tools,profiles,policies}`, `lib/runtime/**`, `lib/spec/**`, `lib/sysdb/live.ts` | **high** (LLM tool loop) | `scripts/try-model.ts` answers a balance question on live; policy tests |
| B Twins + gate | O-B | yes | `lib/twins/**`, `lib/gate/**` | **high** (PGlite on Vercel) | try-pglite on a Vercel preview; gate test with mock model |
| C Interfaces | O-C | yes | `app/api/**`, `lib/services/**`, `cli/**` | med | curl every route; `claude mcp add` against preview |
| D Dashboard | O-D | yes | `app/page.tsx`, `app/(dash)/**`, `components/shipyard/**` | low | pages render with fixtures, then real API |
| E Content | O0 | yes | `agents/**`, `lib/library/blocks.ts`, `scripts/seed-agents.ts`, `scripts/reset-live.ts` | **high for demo** (the catch must fire) | seed loads; E3 3x catch test |

## Task board
Status: `todo` · `wip` · `done` · `blocked`. Plan files have the details.

| ID | Task | Lane | Depends on | Status |
|---|---|---|---|---|
| F1 | Scaffold Next.js + Tailwind + shadcn, git init, install ALL deps | W0 | - | todo |
| F2 | Supabase project + migrations (platform, sys, live seed) + generated types | W0 | F1 | todo |
| F3 | Contracts: `lib/types.ts`, `lib/contracts/api.ts`, `lib/sysdb/schema.ts`, `.env.example` | W0 | F1 | todo |
| F4 | `lib/platform/repo.ts` + `lib/supabase/admin.ts` | W0 | F2, F3 | todo |
| F5 | Stubs for every cross-lane function + every API route (returns fixtures) + `lib/mock/fixtures.ts` | W0 | F3 | todo |
| F6 | Vercel deploy of the skeleton + env vars; commit; create worktrees; init status files | W0 | F1–F5 | todo |
| A1 | Prove a tool-calling loop on the model (try-model.ts) | A | F6 | todo |
| A2 | Registry + 7 tools + profiles + policies | A | F6 | todo |
| A3 | `lib/sysdb/live.ts` adapter | A | F6 | todo |
| A4 | Spec parse + validate | A | A2 | todo |
| A5 | Prompt + runner + policy enforcement + cost + event logging | A | A1–A3 | todo |
| A6 | Policy unit tests | A | A5 | todo |
| A7 | `executeApprovedCall` for approvals | A | A5 | todo |
| B1 | Prove PGlite on a Vercel function (try route on a preview) and decide the fallback | B | F6 | todo |
| B2 | Twin create/seed (`days_ago`)/snapshot/close + diff | B | B1 | todo |
| B3 | Assertion evaluator (allowlist, parameterized) + tests | B | F3 | todo |
| B4 | Scenario parse/validate | B | F3 | todo |
| B5 | `runGate` with pool, majority vote, progressive results | B | B2–B4 (A's runAgent stub is enough) | todo |
| B6 | Reply-only judge | B | B5 | todo |
| B7 | Replay cache (spec hash → stored results) | B | B5 | todo |
| B8 | Gate test with the AI SDK mock model (good live / bad blocked / live untouched) | B | B5 | todo |
| C1 | `lib/services/*`: agents, deploy, runs, approvals, library, audit | C | F6 | todo |
| C2 | REST routes on services + zod + errors + admin token + rate limit | C | C1 | todo |
| C3 | Deploy route: version row + `after()` gate + maxDuration | C | C1 | todo |
| C4 | MCP route (mcp-handler) with all tools; `deploy_agent wait` | C | C1 | todo |
| C5 | CLI (nice) | C | C2 | todo |
| D1 | App shell + nav + design tokens (light/dark) | D | F6 | todo |
| D2 | Agents list | D | D1 | todo |
| D3 | Agent page: spec editor + validation + deploy + versions | D | D1 | todo |
| D4 | Gate board (live polling, flip cards, reply vs end state, blocked banner) | D | D1 | todo |
| D5 | Run trace + twin diff | D | D1 | todo |
| D6 | Library, approvals, audit pages (nice) | D | D1 | todo |
| E1 | Instruction blocks | E | F6 | todo |
| E2 | support-agent spec + 7 scenarios; collections-agent spec + 3 scenarios; MCP demo prompt + YAML | E | F6 | todo |
| E3 | **Prove the catch:** good spec live 3/3, bad edit blocked 3/3 on `second-credit-this-month` | E | I2 | todo |
| E4 | `seed-agents.ts` + `reset-live.ts` | E | F4 | todo |
| E5 | Demo population: 6 extra agents + teams/owners + synthetic history (PRD 17b) | E | F4, A4 | todo |
| E6 | Traffic simulator + 12 member personas; run 40–60 real conversations pre-demo | E | I1 | todo |
| C6 | `POST /api/admin/simulate` (admin token, max 10) + `team`/`owner` in AgentSummary | C | E6 | todo |
| D7 | "Simulate traffic" button, team/owner columns, persona header "Maya Ortiz · Platform", recent-activity feed | D | C6 | todo |
| T1 | Test-pack engine: load packs, filter by `requires_tools`, fill placeholders → Scenario[]; gate merges spec + pack + generated scenarios (PRD 10.5) | B | B4 | todo |
| T2 | Write 5 test packs, about 40 templates (`lib/library/packs/*.yaml`) | E | F-contracts | todo |
| T3 | Scenario generator (`generateObject`, validate, tag `source: generated`) + `POST /api/agents/:name/generate-tests` + MCP `generate_scenarios` | A + C | A4 | todo |
| T4 | Paraphrase variants (cached) | B | B5 | todo |
| T5 | Coverage report (tools/policies/tables exercised; untested tools) | B | B5 | todo |
| T6 | Gate board at scale: group by source, filters, counters, coverage chip; "Generate tests" dialog on the agent page | D | D4 | todo |
| M1 | After lane-a merges: `google/<id>` routing in resolveModel (@ai-sdk/google installed, key on Vercel); fast = `google/gemini-3.5-flash` (tests, reply judge, variants), careful = `groq/openai/gpt-oss-120b` (live agent, generator); update Vercel SHIPYARD_FAST_MODEL; add Gemini prices to cost.ts | O0→builder | lane-a merged | todo |
| H6 | (optional) custom domain: buy → `vercel domains add` → DNS → update MCP URL in DEMO.md | O0 | I3 | todo |
| I1 | Integrate A+C+E: chat on live works on the deployed URL | O0 | A5, C2, E2 | todo |
| I2 | Integrate B: REST deploy → live/blocked; live DB row counts unchanged | O0 | B5, C3 | todo |
| I3 | MCP from Claude Code against production: create+deploy collections-agent | O0 | C4, I2 | todo |
| I4 | Wire D to the real API (swap fixtures for fetch) | O-D | C2, D2–D5 | todo |
| P1 | `/impeccable init` → critique → fixes → polish on the gate board, run trace, agent page | O-D | I4 | todo |
| H1 | `/qa` on the production URL | O-C | I4 | todo |
| H2 | Demo walk ×3 on production; cache good + blocked runs (replay) | O0 | E3, I4 | todo |
| H3 | Backup demo video | O0 | H2 | todo |
| H4 | Verify the statistic + source; collect demo numbers | O-B | - | todo |
| H5 | `/review` → fix CRITICAL/HIGH → final deploy → freeze | O0 | H1–H3 | todo |
| S1 | README + Devpost + `/brag-slim` video | O0 | H5 | todo |

## Contract change log
(O0 appends. Format: `time | requester | change | affected lanes`)
- W0 | O0 | Platform repo uses the `postgres` driver over SUPABASE_DB_URL (one secret) instead of supabase-js with the service role | all
- W0 | user | Testing at scale added (PRD 10.5): `AgentSpec.test_packs`, `GateConfig.variants`, `Scenario.source`/`pack`, `GateResult.coverage` | A, B, C, D, E

## Orchestration rule (user, 2026-10-24)
O0 orchestrates only: it writes prompts, reviews, merges, commits and deploys. **All code is written by subagents.**
