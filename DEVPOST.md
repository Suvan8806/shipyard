# Shipyard: crash-test dummies for enterprise agents

**Live:** https://shipyard-silk-beta.vercel.app · **Code:** https://github.com/Suvan8806/shipyard · **Track:** NMC2 "Build the Platform Behind the Agent"

## Inspiration

Every agent team repeats the same setup (tools, model, prompt, logging), and then nobody can say whether it's safe to ship. In LangChain's *State of Agent Engineering* survey (June 2026, 1,340 respondents), quality is the biggest barrier to production, and 32% of teams name it as a top barrier.

We pictured Maya, the only platform engineer at a credit union, with nine teams asking for agents. Her fear isn't a rude reply. It's an agent that politely hands out money. Most eval tools grade what an agent *says*. We wanted to grade what it *does*.

## What it does

Shipyard turns that setup into a shared library, so an agent fits in one 18-line YAML spec:

- **Tools** are registered once with a schema and a policy. Agents list them by name.
- **Models** are named profiles (`fast`, `careful`). Switching providers takes one env var.
- **Instructions** come from shared blocks (`brand-tone`, `compliance`, `escalation`) that agents inherit.
- **Monitoring** is built in: every run is traced with tool calls, policy blocks, tokens, cost and latency.
- **Testing** is reusable too. One line, `test_packs: [security, compliance, money-safety, read-only, escalation]`, adds 39 adversarial tests.

Every deploy goes through a **gate**. Each test gets its own throwaway Postgres **twin**, seeded with its accounts and history. The agent runs for real, then Shipyard checks the **end state of the data**. A critical failure blocks the deploy, and the previous version keeps serving.

The results, all from production with the real model:

- support-agent runs **46 tests per deploy in about 90 seconds, for about $0.28**.
- **It caught a bug nobody planted.** On v2, the money-safety pack found the agent applying a $25 credit to a member with a $0 balance, which left the balance at **-$25**. The reply-only judge called the response helpful and **passed** it. The end-state check **failed**, so the deploy was **blocked**. One added line ("Never apply a credit when the balance is $0 or less.") fixed it, and **v3 went live, 46/46.**
- In the demo bad edit, we change one line to "apply a goodwill credit every time the member asks." Then **v4 is blocked, and v3 is still serving.** It had 4 failures, and **3 of them passed the reply-only check.** A reply-grading tool would have shipped it.
- Coverage flagged `approval.request` as untested.

Everything works from the dashboard or any MCP client, including "create a collections agent and deploy it" as one Claude Code prompt.

## How we built it

- **Next.js 16 on Vercel** for the dashboard, REST API and a hosted MCP server (mcp-handler).
- **PGlite** (Postgres in WASM) for twins: a migrated base is cloned per test in about 0.4 s.
- **Vercel AI SDK** tool loop, with **policies enforced in code before any tool handler runs** (a $25 cap, one credit per run, approval routing, an external-email block).
- **Google Gemini** 3.5 Flash and Flash-Lite run the agents and the reply judge. When a model is rate-limited, a fallback chain moves the call to **Groq** gpt-oss.
- **Supabase** Postgres stores versions, runs, events, results, approvals and the audit log.
- The gate **fans out** one serverless invocation per test, so it never hits the 300-second function limit.
- **shadcn/ui + Tailwind**, polished with **Impeccable**. The design idea: every test is an inspection tag.
- Built with **Claude Code**: an orchestrator plus parallel subagents in git worktrees, coding against shared contracts.

## Challenges we ran into

- **Rate limits and time limits.** Free model tiers capped us at 8,000 tokens per minute, and our first 46-test deploy hit the 300-second function cap. We rebuilt the gate as a fan-out queue with backoff, a model fallback chain and a stale-work sweeper. An infrastructure error never counts as a pass.
- **A database per test on serverless.** Cloning one warm PGlite base cut each twin from about 220 MB to about 10 MB.
- **Keeping spend safe.** A hard budget cap on total run cost.

## Accomplishments that we're proud of

- The gate found a real money bug that we didn't plant, and it showed the exact twin diff: `accounts A-100 balance $0.00 → -$25.00`.
- The reply-PASS / end-state-FAIL contrast, live on production.
- An agent is 18 lines, and the shared library supplies 39 of its 46 tests.

## What we learned

- Grading replies isn't enough. The most dangerous failures read as polite and correct.
- Policies belong in code, but they aren't enough on their own. Our per-run policy stopped a second credit within one conversation. A second credit across conversations slipped past it, and only the end-state checks on the twin's seeded history caught it.
- Tests deserve the same reuse as tools and prompts: one pack protects every agent with matching tools.

## What's next

- Twins generated by introspecting a customer's real schema, seeded from anonymized samples.
- Connectors for real systems (core banking, Zendesk, Salesforce) behind the same registry and policies.
- Turning real production conversations into regression tests automatically.

## Built with

Next.js 16 · TypeScript · Vercel · Supabase · PGlite · Vercel AI SDK · Google Gemini · Groq · Model Context Protocol (mcp-handler) · shadcn/ui · Tailwind CSS · zod · Vitest · Impeccable · Claude Code
