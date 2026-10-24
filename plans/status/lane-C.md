# Lane C status (services, REST, MCP, CLI)

Branch `lane-c`. Preview (Vercel auth protected; use `npx vercel curl <path> --deployment <url>`):
https://shipyard-30gry6q4u-suvan8806s-projects.vercel.app

| Task | What | Status |
|---|---|---|
| C1 | `lib/services/*` (errors, guard, spec, library, agents, deploy, runs, approvals, audit, chat, tests, admin) | done |
| C2 | REST routes on services (zod on every write, ServiceError -> envelope, admin guard + per-IP limiter) | done |
| C3 | deploy route: startDeploy -> `after(run)` -> 202 `{version, status:'running'}`; DB deploy cap via `repo.countDeploysSince` | done (after() not yet proven with the real gate; lane B gate is a stub here) |
| C4 | hosted MCP `/api/mcp/mcp`, 13 tools (PRD 14 + generate_scenarios + list_test_packs), withMcpAuth when SHIPYARD_ADMIN_TOKEN set | done |
| C5 | `cli/shipyard.ts` (agents, validate, deploy stream, chat, rollback, run) | done |

## Connect Claude Code
```
claude mcp add --transport http shipyard https://shipyard-silk-beta.vercel.app/api/mcp/mcp
# if SHIPYARD_ADMIN_TOKEN is set on Vercel:
claude mcp add --transport http shipyard https://shipyard-silk-beta.vercel.app/api/mcp/mcp --header "Authorization: Bearer <SHIPYARD_ADMIN_TOKEN>"
```

## Verification (preview, commit 1888fbd)
- GET /api/health -> `{"ok":true}`
- GET /api/agents -> `[]` (DB reachable, not seeded yet)
- GET /api/library -> tools/profiles/blocks/policies/packs
- GET /api/audit -> `[]`; GET /api/agents/support-agent -> 404 envelope
- POST /api/agents `{"spec_yaml":""}` -> 400 `bad_request` envelope with zod issues
- MCP initialize OK; tools/list -> 13 tools; tools/call list_agents -> `[]`
- Local: `npx tsx scripts/try-mcp.ts http://localhost:3013` -> 13 tools, list_test_packs/list_library OK
- `npx tsc --noEmit` and `npm run build` pass

## Integration notes (for the orchestrator)
- `lib/services/admin.ts` imports `simulateTraffic`/`resetLive` from `lib/services/lane-e-shim.ts` (typed shim that throws 500).
  After lane-e merges: change that import to `../library/simulate` + `../library/reset` and delete the shim.
- GET /api/approvals and POST /api/approvals/:id return 500 until lane A's `liveDb` lands (stub throws).
- Deploy passes `scenarios = spec scenarios + expandTestPacks(spec)` to `runGate`, plus `specHash` (sha256 of spec_yaml + sorted scenarios), also stored in `agent_versions.spec_hash`.
- `GateResult.coverage` is `null` from GET /versions/:v (coverage isn't persisted). If lane B wants it shown on reload, it needs a column or audit detail.
- `services/spec.ts` falls back to a loose YAML parse when `validateSpec` doesn't return `spec`/`scenarios` (W0 stub). Lane A's real validator should return them.
- Chat 404s when the agent has no live version. Deploys with the W0 gate stub leave the version `running` (stub doesn't write to DB), so no writes were tested on the shared DB.
- try-mcp against a protected preview: set `VERCEL_BYPASS=<protection bypass secret>`.

## REQUESTS
- DEP REQUEST: `picocolors` (used by cli/shipyard.ts; currently only a transitive dep). `@modelcontextprotocol/sdk` is already listed.

## BLOCKED
(none)

## READY TO MERGE
yes (rebase onto main after lanes A/B/E; swap the lane-e shim import)
