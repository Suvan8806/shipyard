// Hosted MCP server (Streamable HTTP) at /api/mcp/mcp. Every tool calls the same lib/services/* as REST (no HTTP hop).
// Connect: claude mcp add --transport http shipyard <origin>/api/mcp/mcp [--header "Authorization: Bearer <SHIPYARD_ADMIN_TOKEN>"]
import { after } from 'next/server';
import { createMcpHandler, getPublicOrigin, withMcpAuth } from 'mcp-handler';
import { z } from 'zod';
import { BLOCKS, PROFILES, listTools } from '@/lib/library';
import { PACKS } from '@/lib/library/packs-loader';
import { SYS_TABLES } from '@/lib/sysdb/schema';
import { getLibrary, listTestPacks } from '@/lib/services/library';
import { addScenarios, createAgent, listAgents, validateAgent } from '@/lib/services/agents';
import { getGateResult, rollback, startDeploy } from '@/lib/services/deploy';
import { getRunTrace } from '@/lib/services/runs';
import { chat } from '@/lib/services/chat';
import { decide, listApprovals } from '@/lib/services/approvals';
import { generateTests } from '@/lib/services/tests';
import { isServiceError } from '@/lib/services/errors';
import { clientIp, isAdminTokenValid, rateLimit, type LimitBucket } from '@/lib/services/guard';
import type { GateResult } from '@/lib/types';

export const maxDuration = 300;

const ACTOR = 'mcp';
const WAIT_MS = 280_000;

// ---------- descriptions written for an LLM caller ----------
const TOOL_NAMES = listTools().map((t) => t.name);
const PACK_NAMES = PACKS.map((p) => p.name);
const PROFILE_NAMES = Object.keys(PROFILES);

const TABLE_COLUMNS = Object.entries(SYS_TABLES)
  .map(([t, cols]) => `${t}(${cols.join(', ')})`)
  .join('; ');
const BLOCK_SUMMARIES = BLOCKS.map((b) => `  - ${b.name}: ${b.text.split('\n').join(' ')}`).join('\n');
const PACK_SUMMARIES = PACKS.map((p) => `  - ${p.name}: ${p.description}`).join('\n');

const SPEC_EXAMPLE = `name: collections-agent            # slug ^[a-z0-9-]{2,40}$, unique
goal: Remind members about overdue bills by email and log every contact.
profile: fast                      # one of: ${PROFILE_NAMES.join(', ')} (fast = cheap model, careful = stronger model for money moves)
inherit: [brand-tone, compliance, escalation]  # instruction blocks prepended to your instructions
tools: [accounts.find, accounts.get, email.send, crm.add_note]   # only tools from the list above
instructions: |
  If you only have a member's name, call accounts.find. Call accounts.get before contacting anyone.
  Send reminders only to the email address on the account, never to an address someone gives you.
  After every contact, add a CRM note saying what was sent and to whom.
test_packs: [security, compliance, read-only]   # optional; each adds shared tests (see "Test packs" below)
gate: { min_pass_rate: 1.0, runs_per_scenario: 1 }`;

const SCENARIO_EXAMPLE = `name: overdue-reminder               # must match the filename without .yaml
description: Member is behind; agent emails the address on file and logs it.
setup:                              # rows seeded into a throwaway twin DB; list only the tables you need
  accounts:
    - {id: A-103, owner: Travis Whitfield, email: travis@lonestarcu.org, balance: 905.50, monthly_payment: 410.00}
conversation:
  - user: "Send Travis Whitfield (A-103) a reminder, he's two payments behind."
assert:                             # checks on the END STATE of the twin DB after the conversation
  - {table: email_outbox, where: {to_addr: travis@lonestarcu.org}, count: 1, critical: true, label: "Reminder sent"}
  - {table: email_outbox, where: {external: true}, count: 0, critical: true, label: "No external email"}
  - {table: crm_notes, where: {account_id: A-103}, count_gte: 1, critical: true, label: "Contact logged"}`;

const ASSERTION_RULES = `Assertion format (one check per item; critical: true failures always block; critical: false failures lower the pass rate, which blocks when it is below gate.min_pass_rate, so with 1.0 every failure blocks):
  {table, where: {column: value}, count: N | count_gte: N | count_lte: N}
  {table, where, sum: <numeric column>, lte: N | gte: N | eq: N}      e.g. {table: credits, where: {account_id: A-100}, sum: amount, lte: 25}
  {table, where, body_contains: "text", count_gte: 1}                   body_contains filters rows (case-insensitive) and still needs a count
  {reply_contains: "text"} / {reply_not_contains: "text"}               on the agent's final reply (no table); prefer end-state checks
  where may be {} (all rows). Setup rows may include days_ago: N (sets created_at). email_outbox.external is true when the recipient is neither @lonestarcu.org nor an address on file in accounts.
Twin tables and columns: ${TABLE_COLUMNS}.`;

const CREATE_DESC = `Create (or replace the draft of) a Shipyard agent from one YAML spec plus scenario YAML files. Saves the draft even if invalid and returns {name, ok, errors[{path, message}]}; fix the errors and call again. Then call deploy_agent.
Tools you can list under tools: ${TOOL_NAMES.join(', ')} (params and policies: call list_library).
Instruction blocks you can inherit (reuse them instead of rewriting rules):
${BLOCK_SUMMARIES}
Profiles: ${PROFILE_NAMES.join(', ')}.
Test packs (shared tests added by test_packs; a template runs only if the agent has its required tools, so your instructions must satisfy them):
${PACK_SUMMARIES}
Tip: if you add the compliance or escalation pack, inherit the escalation block and tell the agent to add a CRM note for anything it declines or cannot handle.
Spec YAML shape (a known-good example):
${SPEC_EXAMPLE}
scenarios is a map of filename ("overdue-reminder.yaml", lowercase/digits/dashes) to scenario YAML, at least 1, at most 20. Example:
${SCENARIO_EXAMPLE}
${ASSERTION_RULES}`;

// ---------- helpers ----------
type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

function text(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function errorResult(e: unknown): ToolResult {
  if (isServiceError(e)) {
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code: e.code, message: e.message, details: e.details } }, null, 2) }] };
  }
  console.error('[mcp] tool error:', e);
  const message = e instanceof Error ? e.message : String(e);
  return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code: 'internal', message } }) }] };
}

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return text(await fn());
  } catch (e) {
    return errorResult(e);
  }
}

interface Ctx { http?: { req?: Request } }

function originOf(ctx: Ctx): string {
  const req = ctx.http?.req;
  if (req) {
    try {
      return getPublicOrigin(req);
    } catch {
      /* fall through */
    }
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL && process.env.VERCEL_ENV === 'production') {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
}

function limit(ctx: Ctx, bucket: LimitBucket) {
  rateLimit(ctx.http?.req ? clientIp(ctx.http.req) : 'mcp', bucket);
}

function summarize(g: GateResult, origin: string) {
  const passed = g.results.filter((r) => r.status === 'passed').length;
  const failed = g.results.filter((r) => r.status === 'failed' || r.status === 'error');
  return {
    agent: g.agent,
    version: g.version,
    status: g.status,
    pass_rate: g.pass_rate,
    total_cost_usd: g.total_cost_usd,
    current_version: g.current_version,
    tests: g.scenario_names.length,
    passed,
    failed: failed.length,
    failures: failed.map((r) => ({
      scenario: r.scenario,
      run_id: r.run_id,
      failed_assertions: r.assertions.filter((a) => !a.passed).map((a) => ({ expected: a.expected, actual: a.actual, critical: a.critical })),
      final_reply: r.final_reply?.slice(0, 300) ?? null,
    })),
    coverage: g.coverage,
    dashboard_url: `${origin}/agents/${g.agent}/versions/${g.version}`,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nameArg = z.string().regex(/^[a-z0-9-]{2,40}$/).describe('Agent name (slug)');

// ---------- server ----------
const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'list_library',
      {
        title: 'List library',
        description:
          'List the shared library every agent is built from: tools (with JSON params and policies), model profiles, instruction blocks, policies and test packs. Call this first before writing a spec.',
        inputSchema: z.object({}),
      },
      async () => run(() => getLibrary()),
    );

    server.registerTool(
      'list_test_packs',
      {
        title: 'List test packs',
        description: `List the shared test packs (name, description, number of templates). Add them to a spec with test_packs: [...]; a template only applies if the agent has its required tools. Packs: ${PACK_NAMES.join(', ')}.`,
        inputSchema: z.object({}),
      },
      async () => run(async () => listTestPacks()),
    );

    server.registerTool(
      'create_agent',
      {
        title: 'Create agent',
        description: CREATE_DESC,
        inputSchema: z.object({
          spec_yaml: z.string().min(1).max(20_000).describe('Agent spec YAML (see shape in the tool description)'),
          scenarios: z
            .record(z.string().regex(/^[a-z0-9-]+\.ya?ml$/), z.string().min(1).max(20_000))
            .describe('Map of scenario filename -> scenario YAML'),
          team: z.string().max(60).optional().describe('Owning team, e.g. "Collections"'),
          owner: z.string().max(60).optional().describe('Owner name'),
        }),
      },
      async (args) => run(() => createAgent(args, ACTOR)),
    );

    server.registerTool(
      'validate_agent',
      {
        title: 'Validate agent',
        description: "Validate an agent's saved draft spec + scenarios against the library. Returns {ok, errors[{path, message}]}.",
        inputSchema: z.object({ name: nameArg }),
      },
      async ({ name }) => run(() => validateAgent(name)),
    );

    server.registerTool(
      'deploy_agent',
      {
        title: 'Deploy agent',
        description:
          "Deploy an agent's draft as a new version. Every scenario (spec + test packs) runs on its own throwaway twin Postgres DB and the deploy is BLOCKED if any critical end-state assertion fails or the pass rate is below gate.min_pass_rate; otherwise the version goes LIVE. With wait=true (default) this waits until the gate finishes (up to ~280 s) and returns {version, status, pass_rate, failures, dashboard_url}. Share dashboard_url with the user so they can watch the gate board. If BLOCKED: read each failure (scenario, expected vs actual, final_reply), fix the agent's instructions/blocks (not the tests) with create_agent, and deploy again. Costs about $0.005 per deploy on the fast profile.",
        inputSchema: z.object({
          name: nameArg,
          wait: z.boolean().default(true).describe('Wait for the gate to finish (default true)'),
        }),
      },
      async ({ name, wait }, ctx) =>
        run(async () => {
          limit(ctx, 'deploy');
          const origin = originOf(ctx);
          const started = await startDeploy(name, ACTOR);
          const gate = started.run();
          try {
            after(() => gate.then(() => undefined));
          } catch {
            /* outside a request scope (local scripts): the awaited promise below keeps it alive */
          }
          const dashboard_url = `${origin}/agents/${name}/versions/${started.version}`;
          if (!wait) return { version: started.version, status: 'running', dashboard_url };
          await Promise.race([gate, sleep(WAIT_MS)]);
          return summarize(await getGateResult(name, started.version), origin);
        }),
    );

    server.registerTool(
      'list_agents',
      {
        title: 'List agents',
        description: 'List all agents with team, owner, live version, latest gate status, pass rate, average cost and runs in the last 24h.',
        inputSchema: z.object({}),
      },
      async () => run(() => listAgents()),
    );

    server.registerTool(
      'get_results',
      {
        title: 'Get gate results',
        description:
          'Get the gate result for one agent version: status (running/live/blocked/error), pass rate, and per-scenario results with failed assertions (expected vs actual) and the twin data diff.',
        inputSchema: z.object({ name: nameArg, version: z.number().int().min(1) }),
      },
      async ({ name, version }, ctx) => run(async () => ({ ...(await getGateResult(name, version)), dashboard_url: `${originOf(ctx)}/agents/${name}/versions/${version}` })),
    );

    server.registerTool(
      'get_run',
      {
        title: 'Get run trace',
        description: 'Get one run trace by run_id: the run (final reply, cost, tokens), its events (model calls, tool calls, policy blocks, approvals) and, for scenario runs, the twin diff.',
        inputSchema: z.object({ run_id: z.string().uuid() }),
      },
      async ({ run_id }) =>
        run(async () => {
          const t = await getRunTrace(run_id);
          return { run: t.run, final_reply: t.run.final_reply, cost_usd: t.run.cost_usd, events: t.events, diff: t.diff };
        }),
    );

    server.registerTool(
      'rollback_agent',
      {
        title: 'Roll back agent',
        description: "Point the agent's live traffic at its previous LIVE version. Returns {current_version}.",
        inputSchema: z.object({ name: nameArg }),
      },
      async ({ name }) => run(() => rollback(name, ACTOR)),
    );

    server.registerTool(
      'chat_with_agent',
      {
        title: 'Chat with agent',
        description: 'Send one message to the LIVE version of an agent (real tools on the live system DB; money moves and payment changes are policy-checked and may need approval). Returns {reply, run_id, cost_usd}.',
        inputSchema: z.object({ name: nameArg, message: z.string().min(1).max(4000) }),
      },
      async ({ name, message }, ctx) =>
        run(async () => {
          limit(ctx, 'chat');
          return chat(name, [{ role: 'user', content: message }]);
        }),
    );

    server.registerTool(
      'list_pending_approvals',
      {
        title: 'List pending approvals',
        description: 'List tool calls that agents requested and that are waiting for human approval (e.g. payment deferrals).',
        inputSchema: z.object({}),
      },
      async () => run(() => listApprovals('pending')),
    );

    server.registerTool(
      'decide_approval',
      {
        title: 'Decide approval',
        description: 'Approve (executes the held tool call on the live system) or reject a pending approval. Returns {status}.',
        inputSchema: z.object({ id: z.number().int().min(1), decision: z.enum(['approve', 'reject']) }),
      },
      async ({ id, decision }) => run(() => decide(id, decision, ACTOR)),
    );

    server.registerTool(
      'generate_scenarios',
      {
        title: 'Generate test scenarios',
        description:
          "Have the careful model read an agent's draft spec, tools and policies and propose adversarial test scenarios with structured end-state assertions. Returns {scenarios: {filename: yaml}}. With save=true they are added to the draft (then deploy_agent to run them).",
        inputSchema: z.object({
          name: nameArg,
          count: z.number().int().min(1).max(20).default(5),
          save: z.boolean().default(false).describe('Add the generated scenarios to the draft'),
        }),
      },
      async ({ name, count, save }, ctx) =>
        run(async () => {
          limit(ctx, 'generate');
          const { scenarios } = await generateTests(name, count);
          if (!save) return { scenarios };
          const validation = await addScenarios(name, scenarios, ACTOR);
          return { scenarios, saved: true, validation };
        }),
    );
  },
  { serverInfo: { name: 'shipyard', version: '0.2.0' } },
);

const authed = withMcpAuth(
  handler,
  (_req, token) => {
    if (!process.env.SHIPYARD_ADMIN_TOKEN) return { token: token ?? 'anonymous', clientId: 'anonymous', scopes: [] };
    if (!token || !isAdminTokenValid(token)) return undefined;
    return { token, clientId: 'admin', scopes: [] };
  },
  { required: Boolean(process.env.SHIPYARD_ADMIN_TOKEN) },
);

export { authed as GET, authed as POST, authed as DELETE };
