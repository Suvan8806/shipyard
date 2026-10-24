# Running Shipyard with parallel orchestrators

Five Claude Code sessions at most run at once, matching the playbook's limit of 3–5. Each session is an **orchestrator**: it owns one lane, reads only the docs it needs, may fan out 1–3 subagents inside its lane, and commits on its own branch. **O0** is the lead. It does the serial foundation, owns the contracts and `main`, merges the lanes and runs the integration checkpoints.

```
            ┌──────────── O0 lead (main tree: hackathon/shipyard) ─────────────┐
            │ W0 foundation → Lane E content → merges → I1..I4 → W3/W4 lead    │
            └────────┬──────────────┬──────────────┬──────────────┬───────────┘
          worktree   │              │              │              │
   ../shipyard-lane-a│  ../-lane-b  │  ../-lane-c  │  ../-lane-d  │
                 O-A runtime    O-B twins+gate  O-C API+MCP   O-D dashboard
```

## Files in this folder
| File | Who reads it | What it holds |
|---|---|---|
| `W0-foundation.md` | O0 | serial setup: scaffold, Supabase, contracts, stubs, deploy, worktrees |
| `lane-A-runtime.md` | O-A | tool registry, policies, runtime loop, spec validation |
| `lane-B-twins-gate.md` | O-B | PGlite twins, diff, assertions, gate, reply judge, replay |
| `lane-C-interfaces.md` | O-C | services, REST routes, hosted MCP, CLI |
| `lane-D-dashboard.md` | O-D | all UI screens |
| `lane-E-content.md` | O0 | blocks, specs, scenarios, seed scripts, **prove the catch** |
| `W2-integration.md` | O0 | merge protocol, checkpoints I1–I4, second wave |
| `W3-W4-polish-harden-ship.md` | everyone | design polish, QA, demo hardening, submission |
| `status/<lane>.md` | lane writes, O0 reads | progress, blockers, requested deps or contract changes |

## Step-by-step launch
1. **O0 runs W0 alone** (`W0-foundation.md`). Nothing else starts until F6 is done: the skeleton deploys, contracts and stubs are committed, and worktrees exist.
2. O0 creates the worktrees (also listed in W0 step F6):
   ```bash
   cd hackathon/shipyard
   for l in a b c d; do git worktree add ../shipyard-lane-$l -b lane-$l; done
   for l in a b c d; do cp .env.local ../shipyard-lane-$l/; (cd ../shipyard-lane-$l && npm install); done
   ```
   Worktrees sit inside `hackathon/`, so `CLAUDE.md` still loads in every session.
3. Open four new terminals, one per worktree, run `claude` in each, and paste that lane's **kickoff prompt** (below).
4. O0 continues with Lane E in the main tree, then merges lanes as they report done (`W2-integration.md`).

## Kickoff prompts (paste one per session)

**O-A** (in `hackathon/shipyard-lane-a`)
```
You are orchestrator O-A for Shipyard, Lane A (runtime). Read ../CLAUDE.md (hackathon mode),
PRD.md sections 6-8 and 11, PLAN.md, and plans/lane-A-runtime.md. Work only in this worktree
(branch lane-a), only on the files Lane A owns. Execute the lane plan top to bottom, using the
subagent prompts in it where it says to fan out. Commit small (feat: ...) on lane-a. Update
plans/status/lane-A.md after every task. Never edit contract files; request changes in your
status file. Stop and report when every "Done when" in the lane plan passes.
```

**O-B** (in `hackathon/shipyard-lane-b`)
```
You are orchestrator O-B for Shipyard, Lane B (twins + gate). Read ../CLAUDE.md, PRD.md sections
6, 9, 10, 12 and 18, PLAN.md, and plans/lane-B-twins-gate.md. Work only in this worktree (branch
lane-b), only on Lane B's files. Do task B1 (PGlite on a Vercel preview) FIRST and report the
result in plans/status/lane-B.md before anything else. Then execute the plan. Commit small on
lane-b. Never edit contract files; request changes in your status file.
```

**O-C** (in `hackathon/shipyard-lane-c`)
```
You are orchestrator O-C for Shipyard, Lane C (services, REST, hosted MCP, CLI). Read ../CLAUDE.md,
PRD.md sections 12-15, PLAN.md, and plans/lane-C-interfaces.md. Work only in this worktree (branch
lane-c), only on Lane C's files. Build on the stubbed cross-lane functions in lib/types.ts; do not
implement runtime or gate logic yourself. Commit small on lane-c. Update plans/status/lane-C.md.
```

**O-D** (in `hackathon/shipyard-lane-d`)
```
You are orchestrator O-D for Shipyard, Lane D (dashboard). Read ../CLAUDE.md, PRD.md sections 1,
16 and 17, PLAN.md (demo script), and plans/lane-D-dashboard.md. Work only in this worktree (branch
lane-d), only on Lane D's files. Build every screen against lib/mock/fixtures.ts first, through the
data-access functions in components/shipyard/api.ts, so wiring to the real API later is a one-file
change. Use the vercel:shadcn skill. Commit small on lane-d. Update plans/status/lane-D.md.
```

## Rules every orchestrator follows
1. **Disjoint ownership.** Edit only the files your lane owns (PRD section 5 is the source of truth). If you need someone else's file, write the request in your status file. Don't edit it.
2. **Contracts are frozen.** `lib/types.ts`, `lib/contracts/api.ts`, `lib/sysdb/schema.ts`, `lib/platform/repo.ts`, migrations and `package.json` belong to O0. To change one, write `CONTRACT REQUEST: <change> (why)` in your status file. O0 applies it on `main`, logs it in PLAN.md, and you rebase.
3. **No new deps.** W0 installs everything expected. If you truly need another package, write `DEP REQUEST: <pkg> (why)` in your status file.
4. **Done means verified.** Run `npx tsc --noEmit` plus the lane's concrete check before you mark a task done.
5. **Rebase, don't merge main into lanes:** `git fetch && git rebase main` (worktrees share the repo, so `main` is local). Only O0 merges into `main`.
6. **Subagents inside a lane** get the 7-part prompt from CLAUDE.md (goal, owns, must not, contract, done when, report, hackathon mode). They work in the lane's worktree on a disjoint sub-slice and never commit; the lane orchestrator commits. Use `general-purpose` (it can load skills) and name the skill in the prompt.
7. **Stuck for 20+ minutes:** write `BLOCKED:` in your status file, try `/investigate`, and propose the fallback from PRD section 18.
8. **Keep context light:** read only the PRD sections your kickoff lists.

## Status file format (`status/<lane>.md`)
```
# Lane X status
Updated: <time>
| Task | Status | Commit | Note |
|------|--------|--------|------|
| A1   | done   | abc123 | try-model.ts answers balance Q in 3.1s |
REQUESTS:
- CONTRACT REQUEST: RunResult needs `tokens_in` (gate shows it)
- DEP REQUEST: none
BLOCKED: none
READY TO MERGE: yes/no (all Done-when checks pass at commit <sha>)
```
