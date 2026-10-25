# Lane B status
Updated: 2026-10-24
| Task | Status | Commit | Note |
|------|--------|--------|------|
| B1 PGlite on Vercel | done | 35bc604, 4c38fd4 | works; decision KEEP PGlite (numbers below). Probe route deleted. |
| B2 twin + diff | done | 35bc604 | `lib/twins/twin.ts` (one migrated base per warm function + `clone()` per twin), `lib/twins/diff.ts` |
| B3 assertions | done | 4c38fd4 | count/count_gte/count_lte, sum lte/gte/eq (numeric), body_contains, reply_contains, reply_not_contains; allowlist; params only |
| B4 scenarios parse | skipped | - | Lane A owns `lib/spec/parse.ts`; gate takes `Scenario[]` already parsed |
| B5 gate | done | 4c38fd4 | pool (SHIPYARD_GATE_CONCURRENCY, default 4), majority vote, critical rule, per-attempt error isolation, live-db refusal |
| B6 reply judge | done | 4c38fd4 | `lib/gate/reply-check.ts`, Output.object, fast profile, informational; SHIPYARD_REPLY_JUDGE=0 disables |
| B7 replay cache | done | 4c38fd4 | keyed by `agent_versions.spec_hash` (`repo.findVersionByHash`); `specHash()` helper in `lib/gate/replay.ts` |
| B8 gate test (MockLanguageModelV4) | done | 4c38fd4 | good -> live; second-credit -> blocked, diff = 1 added credits row |
| T1 test-pack engine | done | 35bc604 | `lib/gate/packs.ts`; support-agent expands to 39 pack scenarios; bundled on Vercel (verified) |
| T4 variants | done | 4c38fd4 | `lib/gate/variants.ts`, gate.variants (max 3), names `<scenario>~v<i>`, cached by hash |
| T5 coverage | done | 4c38fd4 | `lib/gate/coverage.ts` from run events (tool_call/policy_block/approval) + assertion tables |
| R1 error classification | done | (this commit) | `classifyModelError`: dead (credits/quota w/o retry hint/bad key/401-403) -> skip now + 10-min process-wide mark (provider-wide for key-level); tool_format (`<\|`, "Tool call validation failed") -> retry once then next model; 413 -> next model; throttle -> backoff. Chain entries without an API key dropped. Trace events `error/provider_dead`, `error/tool_format`. Generate now uses the resilient chain too |
| R2 budget cap | done | (this commit) | SHIPYARD_BUDGET_USD (default 8) vs sum(runs.cost_usd), cached 30 s (`lib/runtime/budget.ts`, `repo.totalSpendUsd`). Runner: outcome error + "Budget reached ($X of $Y)..."; deploy/chat/generate/simulate: HTTP 402 `budget_exceeded`; judge/paraphrase skip. GET /api/health -> {ok, spend_usd, budget_usd} |
| R3 coverage for fan-out | done | (this commit) | No coverage column, so `getGateResult` computes it on read (scenario_results + one `listToolEventsForRuns` query); variants resolve to their base scenario |

## B1 numbers (Vercel preview, 2048 MB function, iad1 default)
Probe: base `PGlite.create()` + SYS_SCHEMA_SQL, then 4 concurrent `clone()`, seed + snapshot + insert + diff each.
- Cold: base create+migrate **7.6-7.8 s** (once per function instance), RSS 730 MB.
- 4 concurrent clones: **4.4 s cold, 2.7-3.6 s warm** (~0.7-0.9 s per twin, CPU-bound on ~1 vCPU). Seed+snapshot+diff x4: ~80-140 ms.
- Memory: 80 twins (2 requests x 10 rounds of 4) in one warm instance plateau at **1.60-1.68 GB RSS** (no leak; clones are freed on close).
- Packs: `lib/library/packs/*.yaml` are traced into the function bundle (5 packs, support-agent expands to 39).
- Local (Node 22, Windows): base 1.5 s, 4 clones 1.6 s, warm clone 0.42 s, peak RSS ~1.2 GB at concurrency 4.

**Decision: keep PGlite** (no SchemaTwin fallback). The 7.8 s cold base is paid once per function instance and is small next to a 40-test gate.
`vercel.json` sets `memory: 2048` for `app/api/**/*.ts` (Hobby max). **Do not raise SHIPYARD_GATE_CONCURRENCY above 4 at 2048 MB**
(each in-flight twin is ~180 MB). If the team is on Pro, raise memory to 3009 and concurrency to 6-8.

## Notes for integrators
- `runGate(args, opts?)`: optional 2nd arg `{ modelOverride }` is passed into `runAgent` (tests). Signature still satisfies `RunGateFn`.
- Gate merges `args.scenarios` (spec + accepted generated, `gen-` prefix -> source generated) with `expandTestPacks(spec)`, dedupes by name, then adds paraphrase variants.
- Deploy route (Lane C) should call `runGate` inside `after()` with `maxDuration = 300`, passing `specHash: specHash(spec_yaml, scenarios)` from `lib/gate/replay.ts` and storing the same hash in `createVersion({ spec_hash })`.
- Groq rate limits: each attempt is 1 agent run + 1 judge call. Set `SHIPYARD_REPLY_JUDGE=0` if Groq 429s; judge failures return null and never affect status.
- `lib/gate/llm.ts` resolves `groq/<model>` to `@ai-sdk/groq`, anything else as a gateway string. Lane A may have its own resolver; dedupe after merge.
- Assertion `reply_not_contains` is read via a local cast (`Assertion & { reply_not_contains?: string }`) until Lane A's contract field lands.

REQUESTS:
- CONTRACT REQUEST: `Assertion.reply_not_contains?: string` (Lane A adding in parallel). `RunGateFn` could add optional `opts?: { modelOverride?: LanguageModel }` (already accepted as an extra param, no change required).
- DEP REQUEST: none
BLOCKED: none. Not verified on Vercel: a full DB-backed gate (needs Lane A runner + Lane C deploy route); covered locally by tests/gate/gate.test.ts with mocked repo.
READY TO MERGE: yes (lane-b). Pre-existing tsc error `app/layout.tsx: Cannot find name 'LayoutProps'` is from Next typegen, not this lane.


## STOPPED AT (2026-10-24, gate-reliability pass) - commit 4145451 on lane-b
Goal: a ~46-test deploy always reaches live/blocked/error; Groq 429s slow it down but don't break it.

### Done (compiles; tsc clean, vitest 61/61, `npm run build` green; NOT yet tested on Vercel)
- **Fan-out gate** (`lib/gate/queue.ts`). The deploy route inserts one row per attempt into `scenario_results`.
  Each row is `status='running'` with `before_snapshot = {"__gate":"queued","scenario":{...}}`, so **no schema change** is needed.
  Then it "pumps": `repo.claimQueuedScenarios` claims up to `SHIPYARD_GATE_CONCURRENCY` (default now **3**) attempts, under a
  per-version advisory lock with an in-flight bound. It POSTs each claimed attempt to `/api/internal/gate/run-scenario`
  (header `x-shipyard-internal` = `SHIPYARD_INTERNAL_SECRET`, or sha256 of `SUPABASE_DB_URL`; it forwards `x-vercel-protection-bypass`
  from `VERCEL_AUTOMATION_BYPASS_SECRET` or from the incoming request). Each worker invocation (maxDuration 300) runs one attempt,
  pumps the next one, then calls `finalizeVersion` (a conditional `UPDATE ... WHERE status='running' RETURNING`, so it's idempotent).
  If a dispatch fails, the attempt runs inline while there is time; otherwise it goes back to the queue.
  `SHIPYARD_GATE_MODE=inline` restores the old single-invocation `runGate`.
- **Shared logic**: `lib/gate/attempt.ts` (runAttempt) and `lib/gate/verdict.ts` (decide, applyVerdict, finalizeVersion). `runGate` uses both, so tests are unchanged.
- **Stale sweeper**: `GET /api/agents/:name/versions/:v` calls `reconcileGate`. It marks in-flight attempts older than 6 min and every unfinished
  attempt of a version older than 10 min as `error`, then finalizes. Old rows with `status='running'` and a null `before_snapshot` are
  treated as in-flight, so **support-agent v1 gets swept on its next GET**. When work is queued and slots are free, it re-pumps in `after()`.
- **Rate limits** (`lib/runtime/model.ts` `createResilientModel`, used by the runner and by the judge/variants). On 429/503/529 it honors
  `retry-after(-ms)` or Groq's "try again in Xs", adds jitter, and allows 30 s per model and 90 s per call.
  It then does a sticky fallback through `SHIPYARD_FALLBACK_MODELS` (default `google/gemini-3.5-flash,groq/openai/gpt-oss-20b,google/gemini-3.5-flash-lite`).
  `model_call` events are named after the model that actually served them and carry `payload.fallback_from`. Throttles are logged as `error` events named `rate_limit`.
  Once the chain is exhausted, the run fails with `RateLimitExhaustedError`, and the scenario's `final_reply` reads "Gate error: Rate limited on every model ...".
  The run budget is 240 s.
- The judge and variants use the fast model: `SHIPYARD_FAST_MODEL`, else Gemini Flash when `GOOGLE_GENERATIVE_AI_API_KEY` is set. The judge budget is 20 s, and it is skipped for errored attempts.
- MCP `deploy` (`startDeploy().run()` without args) still waits: the coordinator supervises (reconcile + pump every 3 s) for up to about 280 s.

### Half-done / not verified
- **No real run on a Vercel preview yet.** The open questions are below.
  (a) Does the request origin plus the bypass header reach the internal route on a protected preview? If not, attempts fall back to running inline.
  (b) Does `sql.begin` with `pg_advisory_xact_lock` behave on the Supabase transaction pooler? It should, because the lock is transaction-scoped.
  (c) Does `sql(rows, ...cols)` bulk insert work with jsonb `before_snapshot`?

### Next steps (in order)
1. `git push origin lane-b`. Wait for the Vercel preview build, then get its URL and bypass secret (`npx vercel curl`, or `npx vercel deploy --yes`).
2. On the preview: `POST /api/agents/collections-agent/deploy`, then poll `GET .../versions/:v` until it reaches a terminal status. Record the timeline and the error count.
   Watch the function logs for `[gate] dispatch ... got HTTP 401/403`, which means protection is blocking the internal fetch. Fix it by setting `VERCEL_AUTOMATION_BYPASS_SECRET` (enable Protection Bypass for Automation) or `SHIPYARD_GATE_BASE_URL`.
3. Run `GET /api/agents/support-agent/versions/1` once on prod after merging. v1 should flip from running to blocked.
4. Optional: set `SHIPYARD_INTERNAL_SECRET` on Vercel. Without it, the secret is derived from `SUPABASE_DB_URL`, which works.

### Known issues
- If enqueue crashes partway, the inserted queued rows stay `running` while the version is marked `error`. This is cosmetic.
- A dispatch that times out after the target has already accepted can run the same attempt twice. It's rare, because the route returns 202 immediately, and the second save just upserts the same row.
- Coverage is still not persisted for fan-out runs. `getGateResult` returns `coverage: null`, same as before.
- Env requested: none required. Optional: `SHIPYARD_INTERNAL_SECRET`, `SHIPYARD_FALLBACK_MODELS`, `SHIPYARD_GATE_MODE`, `SHIPYARD_GATE_BASE_URL`,
  `SHIPYARD_RATE_LIMIT_BUDGET_MS`, `SHIPYARD_RATE_LIMIT_MODEL_BUDGET_MS`. Migrations: none.
