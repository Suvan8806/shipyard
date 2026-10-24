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
| I4 wire to real API | todo | - | after Lane C merges: set `NEXT_PUBLIC_USE_MOCKS=0` on Vercel (or flip the default in api.ts) |

REQUESTS:
- CONTRACT REQUEST: no route accepts generated scenarios into the draft. api.ts `acceptGeneratedTests` re-POSTs `/api/agents` with merged scenarios (assumes Lane C upserts by name). A `PUT /api/agents/:name/scenarios` would be cleaner.
- TOKEN REQUEST (O0, globals.css): `--font-sans: var(--font-sans)` in `@theme inline` is circular, so pages fall back to a serif font. Lane D pins Geist inside `.sy-root` / `body:has(.sy-root)` in components/shipyard/shipyard.css as a workaround. Fix: literal `"Geist", ui-sans-serif, system-ui, sans-serif`.
- LAYOUT REQUEST (O0, app/layout.tsx): title is still "Create Next App"; set it to "Shipyard".
- DEP REQUEST: none
BLOCKED: none
READY TO MERGE: yes (mock mode). Builds clean; every route renders with fixtures, no console errors.
