# Lane E status
Updated: 2026-10-24 (lane E orchestrator)

| Task | Status | Commit | Note |
|------|--------|--------|------|
| E1 blocks | done (W0) | e60ad76 | |
| E2 specs + scenarios | done (W0) | e60ad76 | validate-content: 8 agents, 28 scenarios, 5 packs / 40 templates, OK |
| E4 resetLive | done | 977c26f | `lib/library/reset.ts` `resetLive()` + `resetLiveStatements()`; `scripts/reset-live.ts [--sql] [--no-approvals]` |
| E4 seed-agents | done | 977c26f | `scripts/seed-agents.ts [--sql] [--no-accounts]`; reconciles sys.accounts + upserts 8 agents with team/owner |
| E5 seed-history | done | e920355, da855a3 | `scripts/seed-history.ts [--sql] [--agent x] [--approvals] [--no-cleanup]`; compact SQL, Postgres generates run_events |
| E5 canonical accounts | done | 977c26f | `supabase/migrations/0003_seed_live.sql` = `_personas.yaml` accounts = `CANONICAL_ACCOUNTS` |
| E6 simulator | done | d84c491 | `lib/library/simulate.ts` `simulateTraffic(count, baseUrl, opts)`; `scripts/simulate-traffic.ts --count --concurrency --url --agents` |
| Apply seeds to Supabase | done | - | via Supabase MCP execute_sql (see below) |
| E3 prove the catch | todo | - | runs after integration (needs real runtime + gate on a preview) |

## Applied to Supabase (project oicyziasyqufalmvoulp), verified via MCP
- public.agents: 8 rows, all with team + owner; draft spec/scenario md5 == repo files for all 8
- agent_versions 22 (6 blocked, each later fixed), scenario_results 132, runs 288 (132 scenario + 156 live, all with cost/tokens), run_events 1706, audit_log 51 (incl. 1 rollback card-dispute 4->3)
- current_version: card-dispute 3, loan-status 3, fraud-alert 5, branch-hours 3, autopay-setup 4, fee-explainer 3; support-agent and collections-agent = null (real deploys)
- sys.accounts: 20 rows = personas; sys.approvals: 2 pending
- Exactly the same counts as the offline check (`npx tsx scripts/check-seed-sql.ts`, PGlite, run twice = idempotent)

## Notes for integrators
- Synthetic tags: agent_versions.spec_hash `synthetic:<agent>:v<n>`, run ids `5e5e5e5e-*`, audit_log.detail.synthetic = true. Re-running seed-history deletes and re-inserts only those rows.
- The Supabase MCP refuses DELETE/TRUNCATE without an interactive confirmation, so the first apply used `--no-cleanup` (DB had no synthetic rows). Later re-seeds: run `npm run seed:history` from a machine/Vercel env that can reach the DB, or paste `--sql` output into the Supabase SQL editor.
- `resetLive()` truncates sys credits/deferrals/crm_notes/email_outbox/approvals, restores the 20 accounts, resets support-agent draft to the good spec, then re-adds the 2 demo pending approvals (pass `{ keepDemoApprovals: false }` to skip). Versions, runs and audit are untouched.
- `simulateTraffic` uses GET /api/agents to pick agents with a live version, POST /api/agents/:name/chat, and GET /api/runs/:id to count policy_block/approval events. Returns SimulateResponse + `errors`.
- Personas, canonical accounts and the good support spec are embedded in lib/library/{simulate,reset}.ts (bundle-safe). `scripts/seed-agents.ts` warns if they drift from agents/*.yaml.
- Model names in synthetic events: groq/openai/gpt-oss-20b (fast) / groq/openai/gpt-oss-120b (careful); prices assumed $0.075/$0.30 and $0.15/$0.60 per 1M tokens.

REQUESTS:
- CONTRACT REQUEST: none
- DEP REQUEST: none
- Lane C: `POST /api/admin/reset-live` -> `import { resetLive } from '@/lib/library/reset'`; `POST /api/admin/simulate` -> `import { simulateTraffic } from '@/lib/library/simulate'` with `simulateTraffic(count, new URL(req.url).origin, { concurrency: 2 })`.
BLOCKED: none (E3 waits for integration)
READY TO MERGE: yes (scripts/**, lib/library/reset.ts, lib/library/simulate.ts, supabase/migrations/0003_seed_live.sql, plans/status/lane-E.md)
