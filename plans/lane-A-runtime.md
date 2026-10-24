# Lane A: Runtime (O-A, worktree `shipyard-lane-a`, branch `lane-a`)

**Goal:** an agent spec becomes a running agent that calls tools on any `SystemDb`, with policies enforced in code and every step logged with tokens, cost and latency.
**Serves demo steps:** all of them. Nothing works without the runner.
**Skills:** `vercel:ai-sdk` (load first; check the current `generateText`, `tool`, `stopWhen`/`stepCountIs`, usage field names and the mock model in `ai/test`), `claude-api` (model ids), `vercel:ai-gateway`.

**Owns:** `lib/library/registry.ts`, `lib/library/tools.ts`, `lib/library/profiles.ts`, `lib/library/policies.ts`, `lib/library/index.ts`, `lib/runtime/**`, `lib/spec/**`, `lib/sysdb/live.ts`, `tests/runtime/**`, `scripts/try-model.ts`
**Must not touch:** contracts (`lib/types.ts`, `lib/contracts/*`, `lib/sysdb/schema.ts`, `lib/platform/repo.ts`), `lib/library/blocks.ts` (Lane E), `app/**`, `package.json`.
**Reads:** `lib/types.ts` (`SystemDb`, `ToolDef`, `Policy`, `RunInput`, `RunResult`, `ValidateSpecFn`, `RunAgentFn`, `LiveDbFn`, `ExecuteApprovedCallFn`), `lib/platform/repo.ts`, `lib/library/blocks.ts` (it may still be a stub; just import `BLOCKS`).

---

## Tasks
### A1. Prove the risky part first: a tool-calling loop (30 min)
`scripts/try-model.ts`: `generateText` with the `careful` model, one fake tool `accounts.get` that returns a hard-coded row, and `stopWhen: stepCountIs(8)`. Ask "What's the balance on A-100?" Print each step's tool calls, usage and latency.
**Done when:** `npx tsx scripts/try-model.ts` prints a tool call followed by a final answer containing the balance. Note the exact usage field names in your status file, because the cost code depends on them. If the gateway string fails, switch to `@ai-sdk/anthropic` and record that in status.

### A2. Library: registry, tools, profiles, policies (60 min, can fan out)
- `registry.ts`: `defineTool()`, `getTool(name)`, `listTools(): ToolInfo[]` (JSON schema via `z.toJSONSchema` or the AI SDK helper, with the policy attached), `toolNames()`.
- `tools.ts`: the 7 tools from PRD 8.4. Use parameterized SQL on `ctx.db` against `sys.*` only. `accounts.get` returns the row plus `credits_last_30_days`. For `email.send`, `external` = the recipient's domain isn't `SHIPYARD_COMPANY_DOMAIN` **and** the recipient isn't an account owner's email. `accounts.apply_credit` inserts a credit and decrements the balance. Numeric columns come back as strings from postgres/pglite, so convert them with `Number()` before returning.
- `profiles.ts` and `policies.ts`: copy them from PRD 8.1 and 8.5.
- `index.ts`: re-export `listTools`, `PROFILES`, `POLICIES`, and `BLOCKS` from Lane E's file.

### A3. Live DB adapter (15 min)
`lib/sysdb/live.ts`: `liveDb()` is a singleton `postgres(SUPABASE_DB_URL, { prepare: false, max: 5 })` wrapped as a `SystemDb` (`query` → `sql.unsafe(text, params)`). Server-only.
**Done when:** `liveDb().query('select count(*) from sys.accounts')` returns 20.

### A4. Spec validation (30 min)
`lib/spec/parse.ts` (zod schemas from PRD 7 and 10.2, including the "exactly one check" refine) and `lib/spec/validate.ts` (`validateSpec: ValidateSpecFn`). Every rule in PRD 7 returns a `{path, message}` such as `tools[3]: unknown tool "acounts.get" (did you mean "accounts.get"?)`. Assertion `table` and `sum` columns are checked against `SYS_TABLES`. YAML syntax errors report the line number.
**Done when:** `tests/runtime/validate.test.ts` covers a valid spec, an unknown tool, an unknown block, a bad profile, a bad assertion column and invalid YAML.

### A5. Runner (90 min; the core, so O-A writes this personally)
- `prompt.ts`: `buildSystemPrompt(spec)` per PRD 11.1.
- `cost.ts`: `PRICES` per model string (USD per 1M tokens in/out; check `claude-api` for current prices) plus `costOf(model, usage)`. Unknown models fall back to the careful price.
- `policy.ts`: `checkPolicy({ tool, args, spec, runState, db, runId })` returns `{ kind: 'allow' } | { kind: 'block', reason } | { kind: 'approval', approvalId }`. For approvals it inserts `sys.approvals` with `tool_args`. `runState` tracks calls per tool.
- `runner.ts`: `runAgent: RunAgentFn` per PRD 11.2:
  - `repo.createRun`, then one `generateText` per user turn, carrying `response.messages` forward.
  - Tools are AI SDK `tool({ description, inputSchema: def.params, execute })`, where `execute` = policy check → handler → `repo.appendEvent` (`tool_call` with args + result, `policy_block` with reason, or `approval`). Errors inside handlers return `{error}` to the model and log an `error` event. Never throw.
  - `onStepFinish` → a `model_call` event with tokens, cost and latency (time since the previous step).
  - `repo.finishRun` with totals; `final_reply` = the last turn's text.
  - Use `input.modelOverride` instead of the profile's model when it's set (Lane B's gate test injects a mock model).
- `approvals.ts`: `executeApprovedCall(id, db)` loads the approval, runs the tool handler directly (bypassing `requiresApproval`), marks the approval `approved` and logs to the audit.
**Done when:** a scratch script runs a spec built from support-agent's YAML against `liveDb()`, gets a correct balance answer, and the `runs` + `run_events` rows are visible in Supabase with cost > 0. Then `payments.defer` → approval row (pending), not a deferral, and `apply_credit(amount: 200)` → `policy_block`.

### A6. Policy tests (20 min)
`tests/runtime/policy.test.ts` uses an in-memory fake `SystemDb` (a tiny object recording SQL) or PGlite directly: requiresApproval holds, maxAmount rejects, maxCallsPerRun rejects the 2nd call, an external email containing the account id is blocked, and an internal one is allowed.

### A7. Hand-off
Rebase on main, run `npx tsc --noEmit` and `npx vitest run tests/runtime`, set `READY TO MERGE` in `plans/status/lane-A.md`, and list any contract requests.

## Parallelism inside the lane
```
A1 (O-A) ──┐
A2 subagent "tools" ──┼──► A5 (O-A) ──► A6 ──► A7
A3 + A4 subagent "spec+live" ──┘
```
**Subagent "tools" prompt**
```
Goal: implement Shipyard's tool library (plans/lane-A-runtime.md A2), serving every demo step.
Owns: lib/library/registry.ts, tools.ts, profiles.ts, policies.ts, index.ts. Nothing else.
Must not: edit lib/types.ts, lib/sysdb/schema.ts, blocks.ts, package.json; no commits; no new deps.
Contract: lib/types.ts (ToolDef, ToolInfo, Policy, SystemDb), lib/sysdb/schema.ts, PRD.md 8.3-8.5 + 9.1.
Skill: vercel:ai-sdk (zod → JSON schema helper).
Done when: npx tsc --noEmit passes; a scratch script using PGlite (new PGlite(); exec SYS_SCHEMA_SQL)
runs every tool once and prints the resulting rows.
Report: files, verification output, open questions. Hackathon mode: no tests, working beats elegant.
```
**Subagent "spec+live" prompt**
```
Goal: spec validation + live DB adapter for Shipyard (plans/lane-A-runtime.md A3, A4).
Owns: lib/spec/**, lib/sysdb/live.ts, tests/runtime/validate.test.ts.
Must not: edit contracts, lib/library/*, package.json; no commits.
Contract: lib/types.ts (ValidateSpecFn, LiveDbFn), lib/sysdb/schema.ts, PRD.md sections 7 and 10.2.
Use toolNames()/PROFILES/BLOCKS from lib/library/index.ts. If they don't exist yet, code against those names;
the tools subagent is writing them in parallel.
Done when: npx tsc --noEmit passes; vitest tests/runtime/validate.test.ts passes; liveDb count query returns 20.
Report: files, verification output, open questions. Hackathon mode.
```
