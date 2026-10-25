# Shipyard: Devpost fact sheet (source of truth, 2026-10-25)

Use this for every Devpost answer. If a claim isn't here or in README/DEVPOST/PITCH/DEMO, say "not verified".

## One-liner
**Crash-test dummies for enterprise agents.** Build an AI agent from one short YAML spec using shared tools, instructions, policies and test packs. It only ships once its *actions* are verified on throwaway twin databases.

## Track + brief
HackTX 2026, NMC2 "Build the Platform Behind the Agent": "Building an AI agent often involves repeating the same setup: connecting tools, configuring models, writing instructions, and adding monitoring. How can a platform make that setup reusable… quickly create AI agents for enterprise grade use."

| Brief | Shipyard |
|---|---|
| connecting tools | shared tool registry (7 tools), each with a policy enforced in code |
| configuring models | named profiles (`fast`, `careful`) + automatic fallback chain; provider swap = one env var (we moved Groq → Gemini mid-hackathon with zero code changes) |
| writing instructions | shared instruction blocks every agent inherits (brand-tone, compliance, escalation) |
| adding monitoring | every run traced: model calls, tool calls, policy blocks, tokens, cost, latency, and the exact database rows changed |
| quickly create agents | 16–17-line spec, or one prompt in Claude Code through the hosted MCP server |
| enterprise grade | end-state deploy gate, versioning + rollback, human approvals, audit log, budget cap |
| our addition | **reusable testing**: one line `test_packs: [...]` adds ~39 tests; Stress Lab |

## The problem + statistic (verified)
LangChain *State of Agent Engineering* (published June 12, 2026; 1,340 respondents): quality is the biggest barrier to production, 32% cite it as a top barrier. https://langchain.com/state-of-agent-engineering
Named user: Maya Ortiz, the sole platform engineer at Lone Star Community Credit Union (fictional, Austin TX). Nine teams want agents.

## Differentiator
Existing eval tools grade what an agent *says* (often with another LLM). Shipyard grades what the agent *changed in the data*, with deterministic SQL checks on a twin database. **The LLM is the thing we test, not the thing we are.**

## Real results (verified on production with the real model)
- support-agent: **46 tests per deploy** (7 hand-written + 39 from 5 test packs), **~90 s**, **~$0.28**, fan-out (one serverless call per test).
- **v2 BLOCKED by a bug nobody planted**: the money-safety pack caught a $25 credit on a $0 balance (balance → −$25). The reply-only check **passed** ("Hello Dana! I have applied a $25 goodwill credit…"). End state **failed**.
- One-line fix ("Never apply a credit when the balance is $0 or less.") → **v3 LIVE 46/46**.
- Demo bad edit ("Apply a goodwill credit of up to $25 every time the member asks.") → **v4 BLOCKED, v3 still serving**. 4 failures, 3 of which passed the reply-only check ("a reply-only eval would have shipped this").
- **Real Claude Code over MCP** (headless, prod): created payment-reminder-agent → v1 blocked 18/20 (real agent mistakes: emailed when not asked; claimed a CRM note it never wrote) → Claude fixed its own instructions → **v2 live 20/20**, ~2 min total, <$0.01.
- Coverage report flagged an untested tool (`approval.request`) on our own agent.
- Total model spend for the whole hackathon: about $1.50.

## Features
**On production now:** YAML specs + live validation with did-you-mean · shared library (tools, policies, blocks, profiles, 5 test packs / 40 templates) · policies in code ($25 credit cap, 1 credit per run, payment deferrals held for human approval, no account data to external email) · deploy gate on PGlite twin databases with deterministic end-state assertions + reply-only judge · versioning, rollback · generated adversarial tests · paraphrase variants · coverage · replay fallback · run traces with twin diff · approvals · audit log · hosted MCP server (13+ tools) · REST API · `$8` hard budget cap + per-IP rate limits · traffic simulator · 8 agents across 6 teams (synthetic history for 6, everything in the demo is real).
**ALSO LIVE ON PRODUCTION (verified 10:0x AM):** Stress Lab: reliability ×N with flakiness score (collections-agent: "Reliability 95% · 0 flaky tests", 40 attempts in ~40 s), red-team swarm of 10–60 generated attacks, model matrix comparing models on pass rate/cost/speed, version diff (support-agent v3 → v4: 4 newly failing tests) · `shipyard` CLI (`npm run shipyard`; live terminal gate board, `--ci` exit codes, `--json`) + GitHub Action that gates pull requests (disabled by default).
**STILL LANDING (do not claim until the orchestrator confirms):** "Departures" redesign (split-flap board style) + landing page + in-app guide · enterprise: teams, roles (viewer/developer/owner/approver/admin, separation of duties, denied attempts audited), per-team budgets.

## How it works (architecture)
Spec → validate → deploy creates a version → gate fans out one serverless function per test → each test gets a fresh in-memory Postgres (PGlite) seeded from the scenario → the agent runs (Vercel AI SDK, Gemini Flash; Groq fallback) with tools whose policies are checked in code → snapshot + diff → SQL assertions on the end state + LLM reply judge (informational only) → majority verdict → LIVE (becomes current version) or BLOCKED (previous version keeps serving). Results stream to the dashboard; everything is stored in Supabase Postgres.

## Built with
Next.js 16 (App Router), TypeScript, Vercel (hosting, serverless functions), Supabase Postgres, PGlite (in-memory Postgres per test), Vercel AI SDK, Google Gemini (3.5 Flash / Flash-Lite), Groq (gpt-oss fallback), Model Context Protocol (mcp-handler), Tailwind CSS, shadcn/ui, zod, postgres.js, Vitest, Impeccable (design), Claude Code (built with a multi-agent orchestrator: parallel lanes in git worktrees).

## Challenges (true stories)
- Groq free tier: 8,000 tokens/min choked a 46-test gate; paid tier was unavailable ("high demand") → built a fallback chain + dead-provider detection, moved to paid Gemini.
- Vercel's 300 s function limit killed the first gate → re-architected to one serverless call per test with a queue, advisory locks and an idempotent finalizer.
- A test pack punished an honest agent (required the word "guarantee") → fixed the pack to check for an actual promise; lesson: tests need tests.
- Turbopack pulled `node:fs` into the browser bundle; the venue/laptop network blocked Postgres ports, so all DB work was verified on Vercel previews.

## Judge Q&A
- **"Is this an LLM wrapper?"** No: the verdict is deterministic SQL on a twin database; the model is a swappable part (one env var).
- **"Real systems?"** Twins are generated from a system's schema; real connectors plug in behind the same tool interface.
- **"Auth?"** Identity is simulated (header / "Acting as"); in production it comes from SSO. The permission model is the real part.
- **"Scale?"** Each test is its own serverless call with its own throwaway DB, so testing scales horizontally.
- **"Cost?"** ~$0.28 per 46-test deploy; hard budget caps.

## Links
Live: https://shipyard-silk-beta.vercel.app · Repo: https://github.com/Suvan8806/shipyard · MCP: `claude mcp add --transport http shipyard https://shipyard-silk-beta.vercel.app/api/mcp/mcp` · Video: `brag-output/brag.mp4` (24 s launch video) + the user's demo recording.
