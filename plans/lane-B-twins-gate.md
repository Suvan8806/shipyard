# Lane B: Twins + gate (O-B, worktree `shipyard-lane-b`, branch `lane-b`)

**Goal:** every scenario runs on its own throwaway Postgres twin, its end state is checked with structured assertions, and the gate decides live or blocked. Results stream into Supabase so the board can flip cards live.
**Serves demo steps:** 2 (green gate) and 3 (the catch: reply PASS vs end state FAIL, plus the diff).
**Skills:** `supabase-postgres-best-practices` (SQL), `vercel:vercel-functions` (maxDuration, `after()`, bundling native/wasm), `vercel:ai-sdk` (mock model for B8, `generateObject` for the judge).

**Owns:** `lib/twins/**`, `lib/gate/**`, `tests/twins/**`, `tests/gate/**`, `scripts/try-pglite.ts`, plus a temporary `app/api/_try/pglite/route.ts` (B1 only; delete it before merge)
**Must not touch:** contracts, `lib/runtime/**` (call `runAgent` from its stub path), other `app/**`, `package.json`.
**Reads:** `lib/types.ts` (`Twin`, `Snapshot`, `TwinDiff`, `Assertion`, `AssertionOutcome`, `GateResult`, `RunGateFn`, …), `lib/sysdb/schema.ts`, `lib/platform/repo.ts`, `lib/runtime/runner.ts` (stub at first).

---

## Tasks
### B1. Prove PGlite on Vercel FIRST (30 min, gating decision)
1. `scripts/try-pglite.ts` locally: `new PGlite()` → `exec(SYS_SCHEMA_SQL)` → insert → select. Time each step.
2. Temporary route `app/api/_try/pglite/route.ts` (`runtime = 'nodejs'`) does the same and creates **4 instances concurrently**. Deploy a **preview** from the lane worktree (`vercel deploy`, never `--prod`), hit the route, and record cold and warm timings and memory.
3. **Decision, written to `plans/status/lane-B.md` right away:**
   - It works → keep PGlite.
   - It fails or takes > 3 s → **fallback:** a `SchemaTwin` that runs `create schema twin_<id>`, then the schema SQL with `sys.` replaced by `twin_<id>.`, then `drop schema … cascade` on close, over `liveDb`-style postgres. To keep tool SQL identical, the adapter rewrites `sys.` to `twin_<id>.` in every query. This still satisfies the `Twin` interface, so no other lane changes.
4. Delete the `_try` route.

### B2. Twin + diff (45 min)
- `twin.ts`: `createTwin: CreateTwinFn`. `seed(setup)` inserts rows per table, mapping `days_ago: N` to `created_at = now() - interval 'N days'`. Columns are checked against `SYS_TABLES`. `snapshot()` selects every table ordered by its primary key and normalizes numerics to numbers and timestamps to ISO strings. `close()` frees the instance.
- `diff.ts`: `diffSnapshots: DiffSnapshotsFn`. Key rows by `id`. Added = in after, not before; removed = the reverse; changed = same id with differing columns (list them). Return only tables with changes.
- `tests/twins/diff.test.ts`: added, removed and changed rows, and the no-change case → `{}`.

### B3. Assertions (45 min)
`assertions.ts`: `evaluateAssertions: EvaluateAssertionsFn`.
- Validate `table`, `where` keys and the `sum` column against `SYS_TABLES`. Throw a clear error for anything else; never interpolate unchecked identifiers.
- Build `select count(*)` or `select coalesce(sum("col"),0)` from `sys."table"` with `where "k" = $1 and …`. Add `body_contains` as `("body" ilike $n or "details" ilike $n)` on tables that have those columns.
- `reply_contains`: case-insensitive substring of the final reply.
- Produce human-readable `expected` and `actual` strings, e.g. `expected: "credits where account_id=A-100: count ≤ 1"`, `actual: "2"`. The dashboard shows these verbatim, so keep them short and readable.
- `tests/gate/assertions.test.ts`: every check type on a seeded PGlite twin, plus a rejected bad table and a rejected bad column.

### B4. Scenarios (20 min)
`scenarios.ts`: `parseScenarios(record: Record<string,string>): Scenario[]`. Use Lane A's zod schema from `lib/spec/parse.ts` if it exists; otherwise a local schema with the same shape, and request a dedupe in status.

### B5. Gate (60 min; O-B writes this personally)
`gate.ts`: `runGate: RunGateFn` per PRD 12.
- Promise pool with concurrency 4 (a tiny helper; no dependency).
- Per attempt: `repo.upsertScenarioResult` `running` → twin → seed → before → `runAgent` (mode `scenario`) → after → diff → assertions → reply check (B6) → upsert final with snapshots, diff, outcomes and run_id → `close()`.
- Majority vote across attempts. Status rule: `blocked` if pass_rate < min, or a critical assertion fails in a majority of attempts. Errors count as failures. If an attempt throws, set the scenario to `error` and keep going.
- `repo.finishVersion` with status, pass_rate and total cost. If live, `repo.setCurrentVersion`. Then `repo.audit`.
- **Live safety:** the gate never receives `liveDb`. Add a guard: if `db` is the live singleton in scenario mode, throw.

### B6. Reply-only judge (30 min, nice tier 1, do it)
`reply-check.ts`: `judgeReply({ conversation, finalReply })` → `ReplyCheck` via `generateObject` with the `fast` profile, schema `{passed: boolean, rationale: string (≤ 20 words)}`. The prompt says: "You only see the conversation. Judge whether the assistant's final reply is helpful, polite and appears policy-compliant." It never affects status. On error → `null`.

### B7. Replay cache (30 min)
`replay.ts`: `specHash(spec_yaml + scenarios)` (sha256). When `SHIPYARD_DEMO_REPLAY=1` and a finished version with the same hash exists, `runGate` copies its scenario results into the new version one at a time with 400–900 ms delays (so the board still animates), then finishes with the same status. The hash is stored in `agent_versions.scenarios` metadata or in the audit detail. Avoid a schema change if possible; if one is needed, write a CONTRACT REQUEST for a `spec_hash` column.

### B8. Gate test with a mock model (40 min)
`tests/gate/gate.test.ts`: use the AI SDK mock language model (check the `vercel:ai-sdk` skill for the current name, e.g. `MockLanguageModelV2`/`V3` in `ai/test`). Inject it through `RunInput.modelOverride` (already in the contract; Lane A's runner honors it). Script two runs:
- good: one `apply_credit(25)` on goodwill-credit → live
- bad: two credits on second-credit-this-month → blocked, with diff showing 1 added credit
- assert that live DB row counts are unchanged (use a fake live db object, or skip if no DB in CI)
Mock `repo` with `vi.mock('@/lib/platform/repo')`.

### Hand-off
Rebase, `npx tsc --noEmit`, `npx vitest run tests/twins tests/gate`, and `READY TO MERGE` in status.
**H4 (after merge, small):** verify the LangChain 32%/1,340 statistic with WebSearch and fetch the source page. Write the exact quote and URL into status. If it doesn't check out, propose a replacement statistic with its source.

## Parallelism inside the lane
```
B1 (O-B) ──► B2 (subagent "twin") ──┐
B3 + B4 (subagent "assert") ────────┼──► B5 (O-B) ──► B6 ∥ B7 ∥ B8 (up to 3 subagents) ──► hand-off
```
B3/B4 don't need B1's answer (they test against local PGlite), so start that subagent at minute 0.

**Subagent "assert" prompt**
```
Goal: structured end-state assertions for Shipyard (plans/lane-B-twins-gate.md B3 + B4), the heart of the demo's "End state: FAIL".
Owns: lib/gate/assertions.ts, lib/gate/scenarios.ts, tests/gate/assertions.test.ts.
Must not: edit contracts, lib/twins/**, package.json; no commits.
Contract: lib/types.ts (Assertion, AssertionOutcome, EvaluateAssertionsFn, Scenario), lib/sysdb/schema.ts, PRD.md 10.
Test against `new PGlite()` with SYS_SCHEMA_SQL applied (tests may create their own instance).
Done when: npx tsc --noEmit passes; vitest tests/gate/assertions.test.ts passes, covering count, count_gte,
count_lte, sum lte/gte/eq, body_contains, reply_contains, bad table, bad column.
Report: files, test output, open questions. Hackathon mode: these ARE tricky pure logic, so tests are wanted here.
```
**Subagent "twin" prompt**
```
Goal: twin lifecycle + diff (plans/lane-B-twins-gate.md B2) using <PGlite | SchemaTwin fallback> per B1's decision.
Owns: lib/twins/**, tests/twins/**.
Must not: edit contracts, lib/gate/**, package.json; no commits.
Contract: lib/types.ts (Twin, Snapshot, TwinDiff, CreateTwinFn, DiffSnapshotsFn), lib/sysdb/schema.ts, PRD.md 9.1.
Done when: npx tsc --noEmit passes; vitest tests/twins passes; a scratch script seeds the second-credit-this-month
setup (days_ago works), inserts one credit, and prints a diff with exactly one added credits row.
Report: files, output, open questions. Hackathon mode.
```
