# Lane A status
Updated: 2026-10-24 (O-A)

| Task | Status | Commit | Note |
|------|--------|--------|------|
| A1 try-model (real Groq tool call) | done | fa7c76b | `npx tsx scripts/try-model.ts`: accounts_get call, then "$412.00" answer |
| model.ts resolveModel | done | fa7c76b | groq/ -> @ai-sdk/groq; anthropic/ -> @ai-sdk/anthropic if ANTHROPIC_API_KEY, else gateway string |
| A2 library (registry, 7 tools, profiles, policies, index) | done | eafeac9 | PACKS loaded from lib/library/packs/*.yaml (keeps `defaults`); BLOCKS normalized to Block[] |
| A3 liveDb | done (untested live) | 18435bb | uses lib/db.ts pool; Supabase 5432/6543 blocked from this laptop |
| A4 parse + validateSpec | done | 0137fee | test_packs, gate.variants, reply_not_contains, did-you-mean, YAML line numbers |
| A5 runner, policy, cost, prompt, approvals | done | 18435bb, d2ed3e7 | 429: SDK per-call retries honor retry-after (maxRetries 4) + whole-turn retry only if no tool ran |
| A6 tests | done | ce41fe5 | validate (11), policy (8), runner w/ mock model (2), generate (2): 23 pass |
| T3 generateScenarios | done | ce41fe5 | `npx tsx tests/runtime/live-generate.ts 5`: 5/5 valid in ~8s |

## Usage field names (ai@7)
`step.usage.inputTokens`, `step.usage.outputTokens` (per step via `onStepEnd`), `result.totalUsage`, `result.responseMessages`.

## Notes for other lanes
- Tool names go on the wire as `accounts_get` etc. (Groq/OpenAI reject dots). Events/logs/policies use dotted names.
- `createRunner(repo)` lets tests inject an in-memory repo; `runAgent` uses lib/platform/repo.
- Events order per step: `model_call` first, then the tool events of that step.
- `executeApprovedCall(id, db)` throws if the approval is missing or not pending (route should map to 404/409).
- Pricing (USD/1M in/out): gpt-oss-20b 0.075/0.30, gpt-oss-120b 0.15/0.60 (console.groq.com/docs/models); Claude per stack-notes.

REQUESTS:
- CONTRACT REQUEST: none beyond the granted `reply_not_contains?: string` on Assertion (added). Lane B's assertion evaluator must handle it (passes when the final reply does NOT contain the text, case-insensitive).
- CONFIG REQUEST (O0, next.config.ts): make sure `lib/library/packs/*.yaml` is traced into server functions, e.g. `outputFileTracingIncludes: { '/api/**': ['./lib/library/packs/*.yaml'] }`. Without it PACKS may be [] on Vercel.
- DEP REQUEST: none
BLOCKED: live-DB verification (A3/A5 Supabase rows) must happen on a Vercel preview.
READY TO MERGE: yes (tsc clean, vitest tests/runtime 23/23, next build passes)
