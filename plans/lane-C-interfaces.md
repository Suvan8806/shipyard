# Lane C: Services, REST, hosted MCP, CLI (O-C, worktree `shipyard-lane-c`, branch `lane-c`)

**Goal:** every platform action is reachable through one service layer, exposed as REST for the dashboard and as a **hosted MCP server** on the production URL, so Claude Code can create and deploy agents live on stage.
**Serves demo steps:** 2 (MCP create + deploy), 3 (deploy from the editor), 4 (run trace API), 5 (rollback/audit).
**Skills:** `vercel:nextjs` (route handlers, `after()`), `vercel:vercel-functions` (maxDuration), `ecc:api-design`, `ecc:mcp-server-patterns`. For `mcp-handler` usage, check its README with WebFetch or the `vercel:ai-sdk` skill's MCP section.

**Owns:** `app/api/**` (taken over from the W0 stubs), `lib/services/**`, `cli/**`, `scripts/try-mcp.ts`
**Must not touch:** contracts, `lib/runtime/**`, `lib/gate/**`, `lib/twins/**`, UI, `package.json`.
**Reads:** `lib/contracts/api.ts`, `lib/types.ts`, `lib/platform/repo.ts`, and the cross-lane functions at their stub paths (`validateSpec`, `runAgent`, `liveDb`, `executeApprovedCall`, `runGate`, `listTools`/`PROFILES`/`BLOCKS`/`POLICIES`).

---

## Tasks
### C1. Service layer (60 min)
`lib/services/{library,agents,deploy,runs,approvals,audit,guard}.ts`. These are plain async functions that return the contract types from `lib/contracts/api.ts` and throw `ServiceError(code, message, status)`.
- `agents.ts`: `listAgents` (joins the latest version status, pass rate and average cost from `runs`), `getAgentDetail`, `createAgent({spec_yaml, scenarios})` (parse the name from the YAML, upsert the draft, validate, audit), `saveSpec(name, spec_yaml)`, `validateAgent(name)`.
- `deploy.ts`: `startDeploy(name)` validates (409 with errors if invalid), checks the rate limit (`repo.countDeploysSince` against `SHIPYARD_MAX_DEPLOYS_PER_HOUR` → 429), runs `nextVersion` and `createVersion('running')`, audits, and returns `{version, run: () => runGate(...)}` so the route can pass `run` to `after()`. It also has `getGateResult(name, v)` and `rollback(name)` (the previous `live` version; 409 if none). `waitForGate(name, v, timeoutMs)` is for MCP.
- `runs.ts`: `getRunTrace(id)`: the run, its events, and the matching scenario_result's diff and snapshots.
- `approvals.ts`: `listApprovals(status)` on `liveDb()` `sys.approvals`, and `decide(id, decision)`. Approve calls `executeApprovedCall(id, liveDb())`; reject sets the status. Both audit.
- `library.ts`, `audit.ts`: straightforward.
- `guard.ts`: `requireAdmin(req)`. If `SHIPYARD_ADMIN_TOKEN` is set, require `Authorization: Bearer <token>` or the cookie `sy_admin`, and return 401 otherwise. Also an in-memory per-IP limiter (token bucket) for chat and deploy.

### C2. REST routes (60 min, can fan out)
One `route.ts` per endpoint in PRD 13. Each one parses the body with the zod schema from `lib/contracts/api.ts` (400 with details on failure), calls the service, and maps `ServiceError` to the error envelope. `export const runtime = 'nodejs'`. Add `dynamic = 'force-dynamic'` on GETs that read live state.
`POST /api/agents/:name/chat` runs `runAgent` on the **current live version's** spec with `liveDb()` (404 if there's no live version).
`POST /api/admin/reset-live` calls the function Lane E exports from `scripts/reset-live.ts`. If that module isn't importable from the app, ask E to put the logic in `lib/library/reset.ts` (CONTRACT REQUEST).

### C3. Deploy route (20 min)
`app/api/agents/[name]/deploy/route.ts`: `export const maxDuration = 300`. It calls `startDeploy`, then `after(() => run())`, and responds right away with `{version, status:'running'}`. Verify on a **preview** deploy that the gate keeps running after the response, by watching `scenario_results` rows appear. If `after()` misbehaves, use the fallback: the client calls `POST /api/agents/:name/versions/:v/run` (a long request the dashboard doesn't await).

### C4. Hosted MCP (60 min)
`app/api/mcp/[transport]/route.ts` with `createMcpHandler`. Register the 11 tools from PRD 14 with zod input schemas and short descriptions written **for an LLM caller**. For example, `create_agent` should say: "Spec YAML must follow this shape: <compact example>; available tools: <names>; reuse blocks: <names>". Include a compact spec example and a scenario example in the descriptions, so Claude Code writes a valid agent on the first try. Then:
- `deploy_agent(name, wait=true)`: `startDeploy` + `after(run)` + `waitForGate(…, 280_000)` → the summary plus `dashboard_url = ${origin}/agents/${name}/versions/${v}`.
- Auth: if `SHIPYARD_ADMIN_TOKEN` is set, require the bearer token (`claude mcp add --transport http shipyard <url>/api/mcp --header "Authorization: Bearer …"`).
- `maxDuration = 300`.
**Done when:** `claude mcp add --transport http shipyard-preview <preview-url>/api/mcp` lists 11 tools in a scratch Claude Code session, and `list_library` + `list_agents` return data. (`scripts/try-mcp.ts` can also connect with `@modelcontextprotocol/sdk`'s StreamableHTTP client.)

### C5. CLI (nice, 30 min, only after C1–C4)
`cli/shipyard.ts` (commander), a thin HTTP client against `SHIPYARD_API_URL`: `validate`, `deploy` (polls and prints colored pass/fail per scenario), `chat` (readline), `rollback`, `run <id>`.

### Hand-off
Rebase, run `npx tsc --noEmit`, and curl every route against `npm run dev` (paste the outputs into status). Set `READY TO MERGE`.
**H1 (later, W4):** run `/qa` on the production URL. You own the QA lane in hardening.

## Parallelism inside the lane
```
C1 (O-C) ──► C2 subagent "routes" ──┐
         ├─► C3 (O-C) ───────────────┼──► hand-off ──► C5
         └─► C4 subagent "mcp" ──────┘
```
**Subagent "routes" prompt**
```
Goal: REST route handlers for Shipyard (plans/lane-C-interfaces.md C2) on top of lib/services/*.
Owns: app/api/** EXCEPT app/api/mcp/** and app/api/agents/[name]/deploy/**.
Must not: edit lib/services/*, contracts, package.json; no commits. Don't put business logic in routes.
Contract: lib/contracts/api.ts (zod schemas), lib/services/* signatures, PRD.md 13.
Skill: vercel:nextjs (route handlers, Next 15+ async params).
Done when: npx tsc --noEmit passes; with npm run dev, curl of each GET route returns contract-shaped JSON,
an invalid POST body returns 400 with the error envelope.
Report: files, curl outputs, open questions. Hackathon mode.
```
**Subagent "mcp" prompt**
```
Goal: hosted MCP server for Shipyard (plans/lane-C-interfaces.md C4). This powers demo step 2, where Claude Code
creates and deploys an agent live.
Owns: app/api/mcp/**, scripts/try-mcp.ts.
Must not: edit lib/services/*, contracts, package.json; no commits.
Contract: lib/services/* signatures, lib/contracts/api.ts, PRD.md 14. Read mcp-handler's README (WebFetch npm/GitHub).
Skill: ecc:mcp-server-patterns, vercel:nextjs.
Done when: npx tsc --noEmit passes; scripts/try-mcp.ts against npm run dev lists 11 tools and calls list_library.
Report: files, output, the exact `claude mcp add` command, open questions. Hackathon mode.
```
