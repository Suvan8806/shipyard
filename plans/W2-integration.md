# W2: Integration + second wave (O0 leads)

## Merge protocol (only O0 merges into `main`)
1. A lane sets `READY TO MERGE: yes (<sha>)` in its status file.
2. O0, in the main tree: `git merge --no-ff lane-x`, then `npm install` (if needed), `npx tsc --noEmit`, `npm test` and `npm run build`.
3. Green → commit, `vercel` preview deploy, smoke the checkpoint below, update PLAN.md, and tell the other lanes to `git rebase main`.
4. Red → fix it if the fix is under 10 minutes and inside glue code; otherwise `git merge --abort` and write the failure into that lane's status file.
5. **Merge order when several are ready:** E → A → B → C → D. Runtime before the gate, and API before UI wiring.
6. Contract requests: O0 edits the contract on `main`, logs it in PLAN.md's change log, commits `chore(contract): …`, and then every affected lane rebases.

## Checkpoints
| ID | Needs | Check on the preview URL | If it fails |
|---|---|---|---|
| I1 | A, C, E | `npm run seed`; `POST /api/agents/support-agent/chat {"messages":[{"role":"user","content":"Balance on A-100?"}]}` returns the balance; `/api/runs/:id` shows model_call + tool_call events with cost | A's try-model fallback (direct anthropic provider) |
| I2 | + B | `POST /deploy` → poll `/versions/:v` → **live 7/7**. Live DB row counts are identical before and after (`select count(*)` on every `sys` table). Then run E3 | B's SchemaTwin fallback; lower concurrency; `fast` profile |
| I3 | C's MCP on production | `vercel --prod`; in a fresh Claude Code: `claude mcp add --transport http shipyard https://<prod>/api/mcp`; run the DEMO.md prompt → collections-agent created and **live** | improve the tool descriptions with an inline spec example; pre-seed collections-agent as a fallback |
| I4 | D wired | every dashboard screen on real data; deploy from the editor animates the board; blocked banner on the bad edit | D falls back to the gate board + trace only |

After I2 passes, **`vercel --prod` after every green merge**. The production URL must never be broken for long.

## Second wave (after the checkpoints, H10–H13); same lanes, new tasks
| Lane | Tasks |
|---|---|
| O-A | approvals execute end-to-end; cost table accuracy; a profile switch demo (`fast` vs `careful` pass rate + cost) for H5 numbers |
| O-B | B6 reply judge (if not done), B7 replay cache verified with `SHIPYARD_DEMO_REPLAY=1`; H4 statistic check |
| O-C | C5 CLI; rate limit + admin token verified on production; `/api/admin/reset-live` |
| O-D | D6 pages, chat panel, empty and loading states (`harden`) |
| O0 | sponsor track integration (if confirmed); README draft; run E3 again on production |

**Before sleep (H13):** everything is merged, production is green, `resetLive()` has run, and PLAN.md is updated. Run `/ecc:save-session`.
