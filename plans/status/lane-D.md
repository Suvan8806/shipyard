# Lane D status
Updated: 2026-10-24 (O-D)
| Task | Status | Commit | Note |
|------|--------|--------|------|
| D1 shell | done | fd2c922 | Sidebar + mobile top nav, persona "Maya Ortiz · Platform", pending-approvals badge, prod status, theme toggle (class `.dark`, persisted) |
| api.ts + mock | done | fd2c922 | `components/shipyard/api.ts` is the only data layer. Mocks ON unless `NEXT_PUBLIC_USE_MOCKS=0`; real fetch path implemented for every route in lib/contracts/api.ts |
| D4 + T6 gate board | done | 5cba6af | 38 tests grouped spec / pack / generated, filters all / failed / critical, counters "38 tests · 5 packs · 0 untested tools", coverage chip, catch spotlight (reply PASS vs end state FAIL), blocked/live/running banners, card flip, 1 s polling, mock "Replay gate" |
| D2 agents list | done | 5cba6af | team/owner columns, status pills, Deploy per row, summary tiles, Simulate traffic, recent-activity feed |
| D3 agent page | done | 5cba6af | spec editor (line gutter, 400 ms debounced saveSpec, error list -> line highlight), Deploy, Generate tests dialog (accept subset), Scenarios / Versions (+Rollback) / Chat / Activity tabs |
| D5 run trace | done | 952fde1 | timeline with per-type icons, collapsible args/result, totals; twin diff green/red/amber with changed cells, before/after snapshot toggle; hidden for live runs |
| D6 library/approvals/audit | done | 952fde1 | policy chips, packs, profiles, blocks; optimistic approve/reject + toast; audit table with target links |
| D7 simulated deploy | done | fd2c922 | mock deploy flips 38 cards over ~8 s; support-agent blocks unless the draft contains `credits_last_30_days` (so fixing the spec goes live) |
| I4 wire to real API | in progress | 01e38f9..bf62823 | Real API is now the default (`NEXT_PUBLIC_USE_MOCKS=1` for offline mocks). See STOPPED AT. |

REQUESTS:
- CONTRACT REQUEST: no route accepts generated scenarios into the draft. api.ts `acceptGeneratedTests` re-POSTs `/api/agents` with merged scenarios (assumes Lane C upserts by name). A `PUT /api/agents/:name/scenarios` would be cleaner.
- TOKEN REQUEST (O0, globals.css): `--font-sans: var(--font-sans)` in `@theme inline` is circular, so pages fall back to a serif font. Lane D pins Geist inside `.sy-root` / `body:has(.sy-root)` in components/shipyard/shipyard.css as a workaround. Fix: literal `"Geist", ui-sans-serif, system-ui, sans-serif`.
- LAYOUT REQUEST (O0, app/layout.tsx): title is still "Create Next App"; set it to "Shipyard".
- DEP REQUEST: none
BLOCKED: none
READY TO MERGE: yes (mock mode). Builds clean; every route renders with fixtures, no console errors.

## STOPPED AT (2026-10-24, session paused)
Branch `lane-d`. Commits: 01e38f9 foundation · e382717 gate board + rail · 6242eee agents slice · bf62823 WIP trace/admin. `npx tsc --noEmit` is clean apart from `@ai-sdk/google` missing from node_modules (lib/runtime/model.ts, not Lane D).

### Done
- **Data layer** (`components/shipyard/api.ts`): `USE_MOCKS` only when `NEXT_PUBLIC_USE_MOCKS === '1'`. `NEXT_PUBLIC_API_ORIGIN` routes requests through a same-origin dev proxy at `app/(dash)/api-proxy/[...path]/route.ts`, because prod sends no CORS headers; the proxy returns 404 when the env var is unset. Non-JSON 5xx/504 bodies and network failures become readable `ApiRequestError`s, and there is an `errorMessage()` helper.
- **Shared states** (`components/shipyard/states.tsx`): ErrorState with Retry, StaleNotice, EmptyState, TableSkeleton.
- **Status pills** use token classes (direction 4.3). The `sy-*` CSS vars are aliased to the tokens, and the Geist font pin was removed.
- **Shell:** Notice-blue rail at lg (232px). Status line reads "Production · Up" or "API unreachable", derived from the approvals poll. Pending badge.
- **Gate board** (`gate/gate-model.ts`, `gate-card.tsx`, `gate-banner.tsx`, `gate-board.tsx`):
  - Polls every 1 s while running. Scenarios without a result row show as UNDER TEST placeholders (taken from `scenario_names`). After a gate finishes, only real results count, because seeded gates list 20 names but have 6 results.
  - Groups in fixed pack order. Within a group, tags sort failed > error > running > passed. Tag codes look like MS-03.
  - Failed tags get a solid band with End state above Reply check. ERROR tags are a separate warn style labelled "Infrastructure error, not a test failure". They lazily fetch the run trace and show the `error` event message (e.g. the Groq rate limit).
  - Calm "Still running… N/46" copy after 45 s with no progress, and "Recording the verdict…" once every tag is done.
  - Blocked banner reads "Blocked. vN is still serving." / "Nothing was deployed." with a "View failing run" button. The Live banner handles `current_version != version`. The Error banner reads "The gate couldn't finish. No version was changed." with "Run the gate again".
  - Counters strip, disagreement note, catch spotlight.
- **Agents slice** (builder, committed):
  - Agents list: null handling, latest≠live note, Simulate traffic with a spinner and a summary toast.
  - Agent page and spec editor: debounced PUT, text kept on error, Retry save.
  - Deploy goes to the gate board (409 → "Open vN").
  - Generate tests in real mode = copyable YAML export (GAP: no save route).
  - Versions tab: rollback confirm.
  - Chat keeps the typed message on failure.
  - Activity feed shows in-flight runs (outcome null) as running.

### Half-done
- `components/shipyard/trace/*` (run-trace, timeline, json-block, twin-diff) and `components/shipyard/admin/*` (approvals, audit, library) were committed mid-flight from the builder as WIP (bf62823). They compile, and the builder later reported them finished: each page was rendered against prod via the proxy (error-run infra box, live run hides the diff, never-finished run, 404, library chips, 2 pending approvals, audit links). The orchestrator has NOT reviewed the diff, and approve/reject was never POSTed to prod. Still to confirm: in-flight run polling, the error-event box, diff null / snapshots null states, audit `name@vN` links, optimistic approve/reject rollback.

### Next steps (in order)
1. Review the bf62823 diff (trace + admin) against the builder brief: real fixtures are in the session scratchpad, so re-curl prod GETs instead.
2. Run local verification: `NEXT_PUBLIC_API_ORIGIN=https://shipyard-silk-beta.vercel.app npx next dev -p 3219`, then open each screen in the gstack `$B` browser and check `$B console --errors`:
   - /agents
   - /agents/support-agent
   - /agents/support-agent/versions/1 (46 tags, running/error/failed)
   - /agents/card-dispute-agent/versions/2 (blocked)
   - /agents/card-dispute-agent/versions/4 (live, not serving)
   - /runs/0c77dd8e-ce99-4af6-9377-dbadb443c598 (error run)
   - /runs/5e5e5e5e-4382-2038-efb7-fdcbec11fb97 (live run)
   - /library
   - /approvals
   - /audit
3. Check mock mode still works: `NEXT_PUBLIC_USE_MOCKS=1`, gate replay, accept generated tests.
4. Run `npm run build`, push, and test the lane-d Vercel preview (deployment protection: `npx vercel curl` or a bypass token).
5. Polish: gate tag flip on the real transition, and a sticky filter offset on mobile.

### Known issues
- **Infinite Fast Refresh reload loop** in local dev while builders were editing files, so the gate page never got past the skeleton in the headless browser. It is probably caused by concurrent file writes (or tsc writing tsconfig.tsbuildinfo). Re-test with a quiet tree; if it persists, investigate.
- **Slow gate GET:** `GET /api/agents/support-agent/versions/1` took 27.7 s on prod (cold or slow query; backend). The board polls serially, so this only slows updates. The skeleton shows meanwhile.
- **Stuck gate:** support-agent v1 has been `running` since 20:37 with 16 `error` results (Groq TPM rate limit). There is no server-side timeout for stuck gates (backend).
- **Error rows have no message:** `ScenarioResultSummary` for error rows carries no error message, so the UI fetches `/api/runs/:id` per error tag. Adding `error: string | null` to the contract would be cheaper.
- **Seeded gates:** `coverage` is null and `scenario_names` is longer than `results`.

REQUESTS (contract/backend):
- `PUT /api/agents/:name/scenarios` to save generated tests (UI currently exports YAML only).
- `error` field on ScenarioResultSummary.
- `{ version }` in the deploy 409 details.
- `live_spec_yaml` on AgentDetail (for the changed-line gutter).
- Gate timeout → status `error`.
- Speed up the gate GET.

Extra contract notes from the trace builder: policy_block payload is {args, reason} (no policy field); error events can be name 'rate_limit' with retry_in_ms; audit targets also look like `agent:approval#N`; TestPackSummary lacks requires_tools.
