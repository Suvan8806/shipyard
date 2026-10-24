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
