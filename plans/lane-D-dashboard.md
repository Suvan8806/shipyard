# Lane D: Dashboard (O-D, worktree `shipyard-lane-d`, branch `lane-d`)

**Goal:** the screens judges actually watch. The gate board is the star: cards flip live, reply-only PASS sits next to end-state FAIL, the twin diff makes the bug obvious in one glance, and the blocked banner lands the moment.
**Serves demo steps:** 1, 2, 3, 4, 5.
**Skills:** `vercel:shadcn`, `vercel:nextjs`, `ecc:frontend-patterns`, `vercel:react-best-practices`. Later, in W3: `/impeccable` (init → critique → polish), `ecc:motion-ui` for the card flip.

**Owns:** `app/page.tsx`, `app/(dash)/**`, `components/shipyard/**`
**Must not touch:** `components/ui/**` (shadcn output from W0; to add a component, write a DEP REQUEST and O0 runs `shadcn add`), `app/layout.tsx`, `app/globals.css` (request token changes), `app/api/**`, contracts, `package.json`.
**Reads:** `lib/contracts/api.ts`, `lib/types.ts`, `lib/mock/fixtures.ts`.

## The key design rule
All data access goes through **`components/shipyard/api.ts`**, with functions like `getAgents()`, `getAgent(name)`, `saveSpec()`, `deploy()`, `getGate(name,v)`, `getRun(id)`, `getLibrary()`, `getApprovals()`, `decide()`, `getAudit()`, `rollback()` and `chat()`. Each one returns the contract types. Until I4, they return fixtures behind `NEXT_PUBLIC_USE_MOCKS=1` with a fake 300 ms delay. **I4 is then a one-file change** to `fetch('/api/...')`. Include a mock deploy that simulates cards flipping over about 8 s, so the gate board animation can be built without a backend.

---

## Tasks
### D1. Shell (30 min)
`app/(dash)/layout.tsx`: a left nav (Agents, Library, Approvals with a pending count badge, Audit), the product name "Shipyard" with a small wordmark, and the production status. Use shadcn tokens with light and dark both working. Mobile is a top nav at 16px gutters (judges may open it on a phone). `app/page.tsx` redirects to `/agents`.

### D2. Agents list `/agents` (30 min)
A table: name, live version (`v3` or "none"), latest status badge (live green, blocked red, running animated amber, draft grey), pass rate, average cost per run (`$0.004`), updated. The row links to the agent, and a Deploy button navigates to the gate board for the new version.

### D3. Agent page `/agents/[name]` (75 min)
- **Spec editor:** a monospace textarea with a line-number gutter (plain CSS, no editor library). Validate after 400 ms debounce via `saveSpec`, and show errors in a list under the editor with the path. Highlight the line when the path maps to one (`instructions` → that block).
- **Deploy** button (disabled while invalid). On click, `deploy()` → `router.push(/agents/[name]/versions/[v])`.
- Tabs: Scenarios (name, description, assertions shown as readable labels), Versions (status, pass rate, date, links to gate boards, a **Rollback** button on the current live version), Chat (nice: a simple message list against the live version, showing cost per reply and linking to the run trace).

### D4. Gate board `/agents/[name]/versions/[v]` (90 min, the hero screen; O-D builds this personally)
- Header: agent, version, status pill, pass rate, total cost, and elapsed time ticking while `running`.
- Poll `getGate` every 1 s until the status isn't `running`.
- A grid of scenario cards. Each card shows:
  - the name, and a status that animates from running to passed or failed (a flip or color sweep; keep it subtle)
  - **two result rows:** `Reply check: PASS ✓` (muted, from `reply_check`) and `End state: FAIL ✗` (prominent). When they disagree, add a callout chip: **"A reply-only eval would have shipped this."**
  - failed assertions as `expected … / actual …` in monospace
  - a "View run" link to `/runs/[run_id]`, plus an inline **mini diff** (for example `credits +1 row: A-100 $25.00 "late fee goodwill"`)
- Blocked → a full-width red banner at the top: **"Blocked. v{current} is still serving."** with a Rollback/Back to editor action. Live → a green banner: **"Live. v{v} is now serving."**
- Make it legible from the back of a room: big type for status, high contrast.

### D5. Run trace `/runs/[id]` (60 min)
- Left: a vertical timeline of events with icons per type (model_call, tool_call, policy_block in red with the reason, approval in amber, error). It shows tool args and results in collapsible JSON, tokens in/out, cost and latency, and run totals at the top.
- Right: the **twin diff panel**. Per table, show added rows (green), removed rows (red) and changed rows (amber, with changed cells highlighted). Toggle to show the full before/after snapshot.
- If it's a live run (no diff), hide the diff panel.

### D6. Library, Approvals, Audit (nice, 60 min total)
- `/library`: tool cards (name, description, params, **policy chips** like "max $25", "1 per run", "needs approval", "no external w/ account data"), profiles, and blocks (collapsible text).
- `/approvals`: pending rows with Approve/Reject (optimistic, with a toast).
- `/audit`: a table.

### I4. Wire to the real API (after Lane C merges, 30 min)
Switch `api.ts` to fetch, delete the mock delay path (keep fixtures for the empty-state preview), and verify every screen against `npm run dev` with seeded data.

## Parallelism inside the lane
```
D1 (O-D) ──► D4 (O-D) ──────────────┐
         ├─► D2 + D3 subagent "agents" ┼──► I4 ──► P1 (W3)
         └─► D5 + D6 subagent "trace" ─┘
```
**Subagent prompt template** (fill in the parts that change)
```
Goal: <D2+D3 agents list + agent page | D5+D6 run trace + library/approvals/audit> for the Shipyard dashboard
(plans/lane-D-dashboard.md). Serves demo step <n>.
Owns: <app/(dash)/agents/page.tsx + app/(dash)/agents/[name]/page.tsx + components/shipyard/agents/** |
app/(dash)/runs/** + app/(dash)/library/** + app/(dash)/approvals/** + app/(dash)/audit/** + components/shipyard/trace/**>.
Must not: edit components/ui/**, components/shipyard/api.ts (O-D owns it; ask for new functions in your report),
layout, contracts, package.json; no commits.
Contract: lib/contracts/api.ts, lib/types.ts; data ONLY via components/shipyard/api.ts (mocks for now).
Skills: vercel:shadcn, vercel:nextjs.
Done when: npx tsc --noEmit passes; npm run dev renders the pages with fixture data in light and dark at
375px and 1440px widths, with no console errors.
Report: files, screenshots or notes, requested api.ts functions. Hackathon mode: no tests.
```
