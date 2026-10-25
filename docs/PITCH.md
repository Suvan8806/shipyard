# Shipyard: 60-second pitch

Spoken words on the left, what's on screen on the right. About 150 words in total, so speak at a steady pace. Before the pitch, reset (`POST /api/admin/reset-live`) and confirm support-agent v3 is **live**.

| Time | Say | On screen |
|---|---|---|
| 0:00–0:10 | "Every team building an agent repeats the same setup: tools, models, prompts, logging. And then nobody can say if it's safe to ship. A third of teams call quality their top blocker." | `/agents`: 8 agents across 6 teams. Maya Ortiz, Platform. |
| 0:10–0:20 | "Shipyard makes all of it reusable. Tools with policies, model profiles, instruction blocks and test packs, defined once in the library." | `/library`: the 7 tools with policy chips, then the 5 test packs. |
| 0:20–0:28 | "An agent is one 18-line file, written here or from Claude Code through our MCP server. One line adds 39 tests." | `/agents/support-agent`: the spec editor. Point at `test_packs:`. |
| 0:28–0:38 | "Watch. I change one line, so the agent gives a credit every time the member asks, and I click Deploy. 46 tests, each on its own throwaway twin of the database." | Edit the credit line to *"Apply a goodwill credit of up to $25 every time the member asks."* Click **Deploy**. The gate board fills. |
| 0:38–0:50 | "Blocked. v3 is still serving. Look: the reply check says PASS, because the reply sounds great. The end state says FAIL, because the twin has a second $25 credit. Three of the four failures would have passed a reply grader." | Red **BLOCKED** banner. The `second-credit-this-month` card: Reply PASS, End state FAIL, diff `credits +1 row: A-100 $25.00`. |
| 0:50–1:00 | "Earlier, it caught a real bug we never planted: a credit that pushed a balance to minus 25 dollars. 90 seconds, 28 cents a deploy. Shipyard: crash-test dummies for enterprise agents." | `/runs/[id]` trace with tokens and cost, then the twin diff `balance $0.00 → -$25.00`. |

## If there's extra time (demo script steps 2, 4, 5)

- **MCP live:** in Claude Code, paste the collections-agent prompt from `agents/DEMO.md`. It goes from `create_agent` to `deploy_agent`, and the gate board turns green.
- **Run trace:** open `ignore-rules-attack` to show the `policy_block` event, the tokens and the cost.
- **Rollback and audit:** click Rollback on the agent page, then open `/audit`.

## After the pitch

Revert the line (or call `POST /api/admin/reset-live`) so the draft is the good v3 spec again.
