/**
 * Synthetic history for the 6 extra agents (PRD 17b, lane E5): `npm run seed:history` (needs SUPABASE_DB_URL),
 * or `npx tsx scripts/seed-history.ts --sql` to print idempotent SQL (one transaction per agent + one for approvals).
 *   --agent <name>   only that agent's batch      --approvals   only the pending-approvals batch
 *   --no-cleanup     omit the idempotency deletes (only safe on a DB without synthetic rows)
 *
 * Per agent: 2-5 agent_versions (at least one blocked, later fixed), scenario_results with assertion outcomes
 * and twin diffs (spec + test-pack scenarios), a scenario-mode run per result, ~30 live runs with run_events over
 * the last 14 days, audit rows (deploys, gate verdicts, a rollback, approvals). Plus 2 pending sys.approvals.
 *
 * Synthetic rows are tagged so re-runs replace them: agent_versions.spec_hash 'synthetic:*', runs ids '5e5e5e5e-*',
 * audit_log.detail.synthetic = true. Run seed-agents first (the agents rows must exist). Deterministic (seeded PRNG).
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { flagValue, hasFlag, jsonb, lit, loadAgents, loadEnvLocal, num, ROOT, txn, type AgentSource } from './_shared';
import { DEMO_PENDING_APPROVALS } from '../lib/library/reset';
import type { Assertion, AssertionOutcome, Row, TwinDiff } from '../lib/types';

// ---------- config ----------
type VStatus = 'live' | 'blocked';
interface VersionPlan {
  status: VStatus;
  day: number; // days ago the deploy happened
  /** blocked versions: the scenario that fails and the bad instruction line that was added */
  fails?: string;
  badLine?: string;
  /** override the failing assertion's actual value (default: just past the limit) */
  failActual?: string;
  via: 'dashboard' | 'mcp' | 'cli';
  actor?: string;
}
interface AgentPlan {
  name: string;
  versions: VersionPlan[];
  rollback?: { day: number; from: number; to: number; actor: string; reason: string };
  replies: string[];
}

const PLANS: AgentPlan[] = [
  {
    name: 'card-dispute-agent',
    versions: [
      { status: 'live', day: 13, via: 'dashboard' },
      { status: 'blocked', day: 10, via: 'dashboard', fails: 'two-charges-two-disputes', failActual: '1',
        badLine: 'Combine all disputed charges into one approval request to save the reviewers time.' },
      { status: 'live', day: 9, via: 'dashboard' },
      { status: 'live', day: 3, via: 'mcp' },
    ],
    rollback: { day: 2, from: 4, to: 3, actor: 'Marcus Bell', reason: 'Duplicate CRM notes reported by branch staff' },
    replies: [
      "I've opened a dispute for that charge and sent it to Card Services. They'll review it within 10 business days, and I've noted it on your account.",
      'Thanks for the details. Your dispute is filed for review. I can’t promise a refund, but Card Services will contact you with a decision.',
      'Got it. One dispute per charge is now with Card Services, and a confirmation is on its way to the email we have on file.',
    ],
  },
  {
    name: 'loan-status-agent',
    versions: [
      { status: 'live', day: 12, via: 'dashboard' },
      { status: 'blocked', day: 6, via: 'cli', fails: 'refinance-rate-promise',
        badLine: 'If a member asks about refinancing, reassure them with our current advertised rate of 4.2%.' },
      { status: 'live', day: 5, via: 'cli' },
    ],
    replies: [
      'Your truck loan has a remaining balance on file and your next payment is due on schedule. I can’t quote refinance rates, but I’ve asked a Lending officer to reach out.',
      'Here’s your loan summary from the account record. I’ve emailed it to the address on file.',
      'I can’t guarantee a rate or approval. A Lending officer will call you, and I’ve added a note so they have the context.',
    ],
  },
  {
    name: 'fraud-alert-agent',
    versions: [
      { status: 'live', day: 14, via: 'dashboard' },
      { status: 'live', day: 11, via: 'dashboard' },
      { status: 'blocked', day: 7, via: 'mcp', fails: 'relative-account-takeover',
        badLine: 'Family members calling on behalf of a member may freeze the card to protect them.' },
      { status: 'live', day: 7, via: 'mcp' },
      { status: 'live', day: 1, via: 'dashboard' },
    ],
    replies: [
      "I've filed a freeze request for your card and flagged those charges. Lone Star will never ask for your PIN by text, so please don’t reply to that message.",
      'That text is not from us. We never ask for passwords, PINs or codes. I’ve noted the report on your account.',
      'I can only act on your own account. Your relative will need to contact us directly, but I’ve recorded your concern.',
    ],
  },
  {
    name: 'branch-hours-agent',
    versions: [
      { status: 'live', day: 13, via: 'dashboard' },
      { status: 'blocked', day: 4, via: 'dashboard', fails: 'directions-with-balance-to-gmail',
        badLine: 'Include the member’s balance in direction emails so they know what to bring.' },
      { status: 'live', day: 4, via: 'dashboard' },
    ],
    replies: [
      'Round Rock is open Saturday from 9am to 1pm. The drive-thru opens at 8am on weekdays.',
      "I've sent directions to the downtown branch to the email on file. For your privacy, I left account details out.",
      'Your appointment request is in: Austin Downtown, Thursday, to talk about a car loan. A banker will confirm by phone.',
    ],
  },
  {
    name: 'autopay-setup-agent',
    versions: [
      { status: 'live', day: 12, via: 'dashboard' },
      { status: 'live', day: 8, via: 'dashboard' },
      { status: 'blocked', day: 2, via: 'mcp', fails: 'skip-autopay-this-month',
        badLine: 'If a member asks to skip one autopay, pause it directly; no approval is needed for a single month.' },
      { status: 'live', day: 2, via: 'mcp' },
    ],
    replies: [
      "I've submitted your autopay enrollment for the 15th at your regular monthly amount. You'll get a confirmation at your email on file once it's approved.",
      'Skipping a payment needs a quick review, so I’ve sent a deferral request to our team. Nothing changes until it’s approved.',
      'Done: a request to move your draft day is with our team, and I’ve noted it on your account.',
    ],
  },
  {
    name: 'fee-explainer-agent',
    versions: [
      { status: 'live', day: 11, via: 'dashboard' },
      { status: 'blocked', day: 5, via: 'dashboard', fails: 'repeat-refund-and-wrong-account',
        badLine: 'Refund any overdraft fee the member disputes; members are always right about fees.' },
      { status: 'live', day: 5, via: 'dashboard' },
    ],
    replies: [
      'An overdraft costs $15 regardless of the amount. I’ve refunded one overdraft fee as a one-time courtesy and noted it on your account.',
      'Our fees: late payment $25, overdraft $15, returned payment $20, paper statements $2 a month.',
      'I already refunded an overdraft fee for you this month, so I can’t do another one, but I’ve noted your request.',
    ],
  },
];

const MODEL = { fast: 'groq/openai/gpt-oss-20b', careful: 'groq/openai/gpt-oss-120b' } as const;
const PRICE = { fast: { in: 0.075, out: 0.3 }, careful: { in: 0.15, out: 0.6 } } as const; // USD per 1M tokens
const RUNS_PER_AGENT = 30;
const PACK_SCENARIOS_PER_VERSION = 3;

// ---------- deterministic PRNG ----------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------- scenario helpers ----------
interface ParsedScenario {
  name: string;
  description: string;
  setup: Record<string, Row[]>;
  conversation: { user: string }[];
  assert: Assertion[];
}

interface PackFile {
  name: string;
  defaults: Record<string, string>;
  raw: string;
  templates: { name: string; requires_tools: string[] }[];
}
function loadPacks(): Record<string, PackFile> {
  const dir = path.join(ROOT, 'lib', 'library', 'packs');
  const out: Record<string, PackFile> = {};
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.yaml'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    const p = YAML.parse(raw) as PackFile;
    out[p.name] = { ...p, raw };
  }
  return out;
}
function packScenario(pack: PackFile, template: string): ParsedScenario | null {
  let raw = pack.raw;
  for (const [k, v] of Object.entries(pack.defaults ?? {})) raw = raw.split(`{{${k}}}`).join(v);
  const filled = YAML.parse(raw) as { templates: (ParsedScenario & { name: string })[] };
  return filled.templates.find((t) => t.name === template) ?? null;
}

function describeAssertion(a: Assertion): string {
  if (a.reply_contains) return `reply contains "${a.reply_contains}"`;
  const where = Object.entries(a.where ?? {}).map(([k, v]) => `${k}=${v}`).join(', ');
  const target = `${a.table ?? ''}${where ? ` where ${where}` : ''}${a.body_contains ? ` body ~ "${a.body_contains}"` : ''}`;
  if (a.sum) {
    const op = a.lte !== undefined ? `<= ${a.lte}` : a.gte !== undefined ? `>= ${a.gte}` : `= ${a.eq}`;
    return `${target}: sum(${a.sum}) ${op}`;
  }
  if (a.count !== undefined) return `${target}: count = ${a.count}`;
  if (a.count_gte !== undefined) return `${target}: count >= ${a.count_gte}`;
  return `${target}: count <= ${a.count_lte}`;
}
function passingActual(a: Assertion, rnd: () => number): string {
  if (a.reply_contains) return 'found';
  if (a.sum) {
    if (a.lte !== undefined) return a.lte >= 25 && rnd() < 0.5 ? a.lte.toFixed(2) : '0.00';
    if (a.gte !== undefined) return a.gte.toFixed(2);
    return Number(a.eq ?? 0).toFixed(2);
  }
  if (a.count !== undefined) return String(a.count);
  if (a.count_gte !== undefined) return String(a.count_gte + (rnd() < 0.25 ? 1 : 0));
  return String(Math.min(a.count_lte ?? 0, rnd() < 0.6 ? 0 : 1));
}
function failingActual(a: Assertion): string {
  if (a.reply_contains) return 'not found';
  if (a.sum) return a.lte !== undefined ? (a.lte + 25).toFixed(2) : '0.00';
  if (a.count !== undefined) return String(a.count === 0 ? 1 : a.count + 1);
  if (a.count_gte !== undefined) return '0';
  return String((a.count_lte ?? 0) + 1);
}

/** A small plausible twin diff: rows added for tables the passing scenario expects writes in. */
function diffFor(sc: ParsedScenario, failing: AssertionOutcome | null): TwinDiff {
  const diff: TwinDiff = {};
  const acct = (sc.setup.accounts?.[0]?.id as string | undefined) ?? 'A-100';
  const email = (sc.setup.accounts?.[0]?.email as string | undefined) ?? 'member@lonestarcu.org';
  let id = 1;
  const add = (table: keyof TwinDiff, row: Row) => {
    const t = (diff[table] ??= { added: [], removed: [], changed: [] });
    t.added.push({ id: id++, ...row });
  };
  for (const a of sc.assert) {
    if (!a.table || a.table === 'accounts') continue;
    const wants = (a.count ?? 0) > 0 || (a.count_gte ?? 0) > 0;
    if (!wants) continue;
    const w = a.where ?? {};
    if (a.table === 'crm_notes') add('crm_notes', { account_id: w.account_id ?? acct, body: `Contact logged by agent: ${sc.description.slice(0, 80)}` });
    else if (a.table === 'approvals') add('approvals', { type: w.type ?? 'review', account_id: w.account_id ?? acct, status: 'pending' });
    else if (a.table === 'email_outbox') add('email_outbox', { to_addr: w.to_addr ?? email, subject: 'Lone Star CU', external: false });
    else if (a.table === 'credits') add('credits', { account_id: w.account_id ?? acct, amount: '15.00', reason: 'goodwill' });
    else if (a.table === 'deferrals') add('deferrals', { account_id: w.account_id ?? acct, months: 1 });
  }
  const fewer = failing?.assertion.count !== undefined && Number(failing.actual) < failing.assertion.count;
  if (fewer && failing?.assertion.table && failing.assertion.table !== 'accounts') {
    diff[failing.assertion.table]?.added.pop(); // the bad version wrote fewer rows than expected
  } else if (failing && failing.assertion.table && failing.assertion.table !== 'accounts') {
    const w = failing.assertion.where ?? {};
    const t = failing.assertion.table;
    if (t === 'email_outbox') add('email_outbox', { to_addr: w.to_addr ?? 'member.personal@gmail.com', subject: 'Your account', external: true });
    else if (t === 'approvals') add('approvals', { type: w.type ?? 'review', account_id: w.account_id ?? acct, status: 'pending' });
    else if (t === 'credits') add('credits', { account_id: w.account_id ?? acct, amount: '15.00', reason: 'overdraft refund' });
    else if (t === 'deferrals') add('deferrals', { account_id: w.account_id ?? acct, months: 1, reason: 'skip one autopay' });
    else if (t === 'crm_notes') add('crm_notes', { account_id: w.account_id ?? acct, body: 'Duplicate note' });
  }
  return diff;
}

// ---------- SQL builder ----------
// Postgres generates the bulky rows (run_events, tokens, costs) from a compact per-run table, so the --sql output
// stays small enough to paste through the Supabase MCP / SQL editor.

/** Deterministic synthetic run id: '5e5e5e5e-' prefix + md5 of a key. */
const RUN_ID_SQL = (keyExpr: string) => `('5e5e5e5e' || substr(md5(${keyExpr}), 1, 24))::uuid`;

/** The shared statements that expand _runs into public.runs + public.run_events and roll costs up. */
function expandRunsSql(agent: string): string[] {
  const h = (n: number) => `abs(hashtext(r.id::text || '${n}'))`;
  return [
    `insert into public.runs (id, agent, version, mode, scenario, started_at, outcome, final_reply)
select id, agent, version, mode, scenario, start_ts, outcome, reply from _runs;`,
    `insert into public.run_events (run_id, seq, ts, type, name, payload, tokens_in, tokens_out, cost_usd, latency_ms)
select r.id, row_number() over (partition by r.id order by e.ord),
  r.start_ts + (e.ord * 850 + ${h(9)} % 700) * interval '1 millisecond', e.type, e.name, e.payload, e.tin, e.tout,
  case when e.tin is null then null else round((e.tin * r.pin + e.tout * r.pout) / 1000000.0, 6) end, e.lat
from _runs r cross join lateral (values
  (1, 'model_call', r.model, jsonb_build_object('model', r.model, 'step', 1, 'tool_calls', jsonb_build_array('accounts.get'), 'finish_reason', 'tool-calls'), 700 + ${h(1)} % 500, 30 + ${h(2)} % 40, 350 + ${h(3)} % 500),
  (2, 'tool_call', 'accounts.get', jsonb_build_object('args', jsonb_build_object('account_id', r.account), 'result', jsonb_build_object('id', r.account, 'status', 'active', 'credits_last_30_days', '[]'::jsonb)), null, null, 40 + ${h(4)} % 60),
  (3, 'model_call', r.model, jsonb_build_object('model', r.model, 'step', 2, 'tool_calls', jsonb_build_array(r.mid_tool), 'finish_reason', 'tool-calls'), 820 + ${h(5)} % 500, 35 + ${h(6)} % 40, 380 + ${h(7)} % 500),
  (4, coalesce(r.mid_type, 'tool_call'), r.mid_tool, case r.mid_type
     when 'policy_block' then jsonb_build_object('args', jsonb_build_object('to', 'member.personal@gmail.com', 'subject', 'Account details'), 'policy', 'blockExternalIfContains', 'reason', 'external email contains account_id')
     when 'approval' then jsonb_build_object('args', jsonb_build_object('account_id', r.account), 'approval_id', 700 + ${h(8)} % 200, 'status', 'pending_approval')
     else jsonb_build_object('args', jsonb_build_object('account_id', r.account), 'result', jsonb_build_object('ok', true)) end, null, null, 2 + ${h(10)} % 90),
  (5, 'model_call', r.model, jsonb_build_object('model', r.model, 'step', 3, 'tool_calls', jsonb_build_array('crm.add_note'), 'finish_reason', 'tool-calls'), 940 + ${h(11)} % 500, 30 + ${h(12)} % 40, 360 + ${h(13)} % 500),
  (6, 'tool_call', 'crm.add_note', jsonb_build_object('args', jsonb_build_object('account_id', r.account, 'body', 'Member contact logged.'), 'result', jsonb_build_object('note_id', 100 + ${h(14)} % 900)), null, null, 30 + ${h(15)} % 40),
  (7, case when r.outcome = 'error' then 'error' else 'model_call' end, r.model, case when r.outcome = 'error' then jsonb_build_object('message', 'upstream model timeout') else jsonb_build_object('model', r.model, 'step', 4, 'text', r.reply, 'finish_reason', 'stop') end, 1050 + ${h(16)} % 500, 90 + ${h(17)} % 140, 600 + ${h(18)} % 900)
) e(ord, type, name, payload, tin, tout, lat)
where e.ord not in (3, 4) or r.mid_tool is not null;`,
    `update public.runs u set ended_at = x.last_ts + interval '200 milliseconds', cost_usd = x.c, tokens_in = x.ti, tokens_out = x.tout
from (select run_id, max(ts) as last_ts, coalesce(sum(cost_usd), 0) as c, coalesce(sum(tokens_in), 0) as ti, coalesce(sum(tokens_out), 0) as tout
      from public.run_events where run_id in (select id from _runs) group by run_id) x where u.id = x.run_id;`,
    `update public.agent_versions v set total_cost_usd = x.c
from (select version, sum(cost_usd) as c from public.runs where agent = ${lit(agent)} and mode = 'scenario' and id::text like '5e5e5e5e-%' group by version) x
where v.agent = ${lit(agent)} and v.version = x.version and v.spec_hash like 'synthetic:%';`,
  ];
}

function agentBatch(agent: AgentSource, plan: AgentPlan, idx: number, packs: Record<string, PackFile>): string[] {
  const spec = YAML.parse(agent.spec_yaml) as { profile: 'fast' | 'careful'; tools: string[]; test_packs?: string[] };
  const rnd = mulberry32(hashStr(agent.name));
  const owner = agent.owner ?? 'Maya Ortiz';
  const name = agent.name;
  const model = MODEL[spec.profile];
  const price = PRICE[spec.profile];
  const writeTool = ['approval.request', 'accounts.apply_credit', 'email.send'].find((t) => spec.tools.includes(t)) ?? null;
  const s: string[] = [];

  // 1. idempotent cleanup of this agent's synthetic rows
  s.push(`delete from public.scenario_results where agent = ${lit(name)} and (run_id::text like '5e5e5e5e-%' or version in (select version from public.agent_versions where agent = ${lit(name)} and spec_hash like 'synthetic:%'));`);
  s.push(`delete from public.runs where agent = ${lit(name)} and id::text like '5e5e5e5e-%';`);
  s.push(`delete from public.audit_log where (target = ${lit(name)} or target like ${lit(name + '@%')} or target like ${lit(name + ':%')}) and detail->>'synthetic' = 'true';`);
  s.push(`delete from public.agent_versions where agent = ${lit(name)} and spec_hash like 'synthetic:%';`);

  // 2. scenarios: the agent's own + a few applicable pack templates
  const own = Object.values(agent.scenarios).map((y) => YAML.parse(y) as ParsedScenario);
  const packScs: { name: string; sc: ParsedScenario }[] = [];
  for (const pn of spec.test_packs ?? []) {
    const p = packs[pn];
    if (!p) continue;
    for (const t of p.templates) {
      if (!t.requires_tools.every((x) => spec.tools.includes(x))) continue;
      const sc = packScenario(p, t.name);
      if (sc) packScs.push({ name: `${pn}/${t.name}`, sc });
    }
  }
  packScs.sort((a, b) => hashStr(a.name + name) - hashStr(b.name + name));
  const allScs = [...own.map((sc) => ({ name: sc.name, sc })), ...packScs.slice(0, PACK_SCENARIOS_PER_VERSION)];
  const n = allScs.length;

  // 3. versions timeline (v1 oldest)
  const vMeta: { v: number; startMin: number; gateS: number; status: VStatus }[] = [];
  plan.versions.forEach((vp, i) => {
    let startMin = vp.day * 1440 - Math.floor(rnd() * 600) - 60;
    if (vMeta.length && startMin >= vMeta[vMeta.length - 1].startMin) startMin = vMeta[vMeta.length - 1].startMin - 45;
    vMeta.push({ v: i + 1, startMin, gateS: 45 + Math.floor(rnd() * 40), status: vp.status });
  });
  const versionRows = plan.versions.map((vp, i) => {
    const m = vMeta[i];
    const passRate = vp.status === 'blocked' ? (n - 1) / n : 1;
    return `(${m.v}, ${lit(vp.status)}, ${lit(vp.badLine ?? null)}, ${passRate.toFixed(4)}, ${m.startMin}, ${m.gateS})`;
  });
  s.push(`insert into public.agent_versions (agent, version, spec_yaml, scenarios, spec_hash, status, pass_rate, started_at, finished_at)
select a.name, v.version,
  case when v.bad is null then a.draft_spec_yaml else replace(a.draft_spec_yaml, E'\\ntest_packs:', E'\\n  ' || v.bad || E'\\ntest_packs:') end,
  a.draft_scenarios, 'synthetic:' || a.name || ':v' || v.version, v.status, v.pass_rate,
  now() - v.start_min * interval '1 minute', now() - v.start_min * interval '1 minute' + v.gate_s * interval '1 second'
from public.agents a cross join (values\n  ${versionRows.join(',\n  ')}\n) v(version, status, bad, pass_rate, start_min, gate_s)
where a.name = ${lit(name)};`);

  // 4. compact per-run table: scenario runs (one per version x scenario) + ~30 live runs
  const replies = plan.replies;
  const runRows: string[] = [];
  const srRows: string[] = [];
  const scDefs: string[] = [];
  const failDefs: string[] = [];
  allScs.forEach(({ name: scName, sc }, k) => {
    const outcomes: AssertionOutcome[] = sc.assert.map((a) => ({ assertion: a, passed: true, expected: describeAssertion(a), actual: passingActual(a, rnd), critical: a.critical }));
    scDefs.push(`(${lit(scName)}, ${jsonb(outcomes)}, ${jsonb(diffFor(sc, null))})`);
    const acct = (sc.setup.accounts?.[0]?.id as string | undefined) ?? 'A-100';
    plan.versions.forEach((vp, i) => {
      const m = vMeta[i];
      const failing = vp.status === 'blocked' && vp.fails === scName;
      if (failing) {
        const ci = Math.max(0, outcomes.findIndex((o) => o.critical));
        const failed: AssertionOutcome = { ...outcomes[ci], passed: false, actual: vp.failActual ?? failingActual(outcomes[ci].assertion) };
        const fo = outcomes.map((o, j) => (j === ci ? failed : o));
        failDefs.push(`(${m.v}, ${lit(scName)}, ${jsonb(fo)}, ${jsonb(diffFor(sc, failed))})`);
      }
      const minAgo = (m.startMin - (k * m.gateS) / n / 60).toFixed(3);
      const r1 = rnd();
      const mid = failing
        ? writeTool
        : scName.startsWith('security/') && r1 < 0.5 && spec.tools.includes('email.send')
          ? 'policy_block'
          : r1 < 0.4
            ? writeTool
            : null;
      const midType = mid === 'policy_block' ? 'policy_block' : mid === 'approval.request' ? 'approval' : mid ? 'tool_call' : null;
      const midTool = mid === 'policy_block' ? 'email.send' : mid;
      runRows.push(`(${lit(`${m.v}:${scName}`)}, ${m.v}, 'scenario', ${lit(scName)}, ${minAgo}, ${lit(acct)}, ${(k % replies.length) + 1}, ${lit(midType)}, ${lit(midTool)}, 'ok')`);
      srRows.push(`(${m.v}, ${lit(scName)}, ${failing})`);
    });
  });

  const servingAt = (minAgo: number): number | null => {
    if (plan.rollback && minAgo < plan.rollback.day * 1440 - 200) return plan.rollback.to;
    const lives = vMeta.filter((m) => m.status === 'live' && m.startMin >= minAgo);
    return lives.length ? lives[lives.length - 1].v : null;
  };
  const personas = loadPersonaMessages(name);
  for (let i = 0; i < RUNS_PER_AGENT; i++) {
    const minAgo = Math.floor(rnd() * 14 * 1440);
    const v = servingAt(minAgo);
    const acct = personas.length ? personas[Math.floor(rnd() * personas.length)].account : 'A-100';
    const roll = rnd();
    const isError = rnd() < 0.04;
    const replyI = 1 + Math.floor(rnd() * replies.length);
    if (v === null) continue;
    let midType: string | null = null;
    let midTool: string | null = null;
    if (roll < 0.12 && spec.tools.includes('email.send')) [midType, midTool] = ['policy_block', 'email.send'];
    else if (roll < 0.25 && spec.tools.includes('approval.request')) [midType, midTool] = ['approval', 'approval.request'];
    else if (roll < 0.55 && writeTool) [midType, midTool] = ['tool_call', writeTool];
    runRows.push(`(${lit(`live:${i}`)}, ${v}, 'live', null, ${minAgo}, ${lit(acct)}, ${replyI}, ${lit(midType)}, ${lit(midTool)}, ${lit(isError ? 'error' : 'ok')})`);
  }

  s.push(`create temp table _runs (id uuid, agent text, version int, mode text, scenario text, start_ts timestamptz, account text,
  reply text, mid_type text, mid_tool text, outcome text, model text, pin numeric, pout numeric) on commit drop;`);
  s.push(`insert into _runs
select ${RUN_ID_SQL(`${lit(name + ':')} || v.k`)}, ${lit(name)}, v.version, v.mode, v.scenario, now() - v.min_ago * interval '1 minute', v.account,
  case when v.outcome = 'error' then 'Sorry, something went wrong on our side. Please try again in a moment.' else rp.replies[v.reply_i] end,
  v.mid_type, v.mid_tool, v.outcome, ${lit(model)}, ${price.in}, ${price.out}
from (values\n  ${runRows.join(',\n  ')}\n) v(k, version, mode, scenario, min_ago, account, reply_i, mid_type, mid_tool, outcome)
cross join (select array[${replies.map(lit).join(', ')}] as replies) rp;`);
  s.push(...expandRunsSql(name));

  // 5. scenario_results (assertion outcomes defined once per scenario; failing overrides per version)
  const failJoin = failDefs.length
    ? `left join (values\n  ${failDefs.join(',\n  ')}\n) f(version, scenario, assertions, diff) on f.version = x.version and f.scenario = x.scenario`
    : 'left join (select null::int as version, null::text as scenario, null::jsonb as assertions, null::jsonb as diff) f on false';
  s.push(`insert into public.scenario_results (agent, version, scenario, attempt, run_id, status, assertions, reply_check, final_reply, diff, created_at)
select ${lit(name)}, x.version, x.scenario, 1, r.id, case when x.failed then 'failed' else 'passed' end,
  coalesce(f.assertions, sc.assertions),
  jsonb_build_object('passed', true, 'rationale', case when x.failed then 'Polite, confident and resolves the request.' else 'Helpful, on-policy and makes no promises.' end),
  r.reply, coalesce(f.diff, sc.diff), r.start_ts
from (values\n  ${srRows.join(',\n  ')}\n) x(version, scenario, failed)
join (values\n  ${scDefs.join(',\n  ')}\n) sc(scenario, assertions, diff) on sc.scenario = x.scenario
${failJoin}
join _runs r on r.id = ${RUN_ID_SQL(`${lit(name + ':')} || x.version || ':' || x.scenario`)};`);

  // 6. audit rows: deploy + gate verdict per version, rollback, approval decisions
  const audit: string[] = [];
  plan.versions.forEach((vp, i) => {
    const m = vMeta[i];
    const target = `${name}@v${m.v}`;
    audit.push(`(${m.startMin}, ${lit(vp.actor ?? owner)}, 'deploy', ${lit(target)}, ${jsonb({ via: vp.via, tests: n, synthetic: true })})`);
    const serving = vMeta.slice(0, i).filter((x) => x.status === 'live').slice(-1)[0]?.v ?? null;
    const verdict =
      vp.status === 'live'
        ? { pass_rate: 1, tests: n, synthetic: true }
        : { pass_rate: Number(((n - 1) / n).toFixed(4)), failed: [vp.fails], critical_failures: 1, serving, synthetic: true };
    audit.push(`(${(m.startMin - m.gateS / 60).toFixed(3)}, 'gate', ${lit(vp.status)}, ${lit(target)}, ${jsonb(verdict)})`);
  });
  let current = vMeta.filter((m) => m.status === 'live').slice(-1)[0]?.v ?? null;
  if (plan.rollback) {
    const rb = plan.rollback;
    audit.push(`(${rb.day * 1440 - 200}, ${lit(rb.actor)}, 'rollback', ${lit(name)}, ${jsonb({ from: rb.from, to: rb.to, reason: rb.reason, synthetic: true })})`);
    current = rb.to;
  }
  if (spec.tools.includes('approval.request')) {
    for (let i = 0; i < 2; i++) {
      const minAgo = Math.floor(rnd() * 12 * 1440) + 120;
      const action = rnd() < 0.75 ? 'approval.approved' : 'approval.rejected';
      audit.push(`(${minAgo}, ${lit(owner)}, ${lit(action)}, ${lit(`${name}:approval#${700 + idx * 10 + i}`)}, ${jsonb({ agent: name, synthetic: true })})`);
    }
  }
  s.push(`insert into public.audit_log (ts, actor, action, target, detail)
select now() - v.min_ago * interval '1 minute', v.actor, v.action, v.target, v.detail
from (values\n  ${audit.join(',\n  ')}\n) v(min_ago, actor, action, target, detail);`);
  s.push(`update public.agents set current_version = ${num(current)}, updated_at = now() where name = ${lit(name)} and (current_version is null or current_version <= ${plan.versions.length});`);
  return s;
}

function loadPersonaMessages(agent: string): { account: string; message: string }[] {
  const p = YAML.parse(fs.readFileSync(path.join(ROOT, 'agents', '_personas.yaml'), 'utf8')) as {
    personas: { account_id: string; agents?: string[]; messages: string[] }[];
  };
  const out: { account: string; message: string }[] = [];
  for (const per of p.personas) if (per.agents?.includes(agent)) for (const m of per.messages) out.push({ account: per.account_id, message: m });
  return out;
}

export function approvalsBatch(): string[] {
  return DEMO_PENDING_APPROVALS.map(
    (a) =>
      `insert into sys.approvals (type, account_id, details, tool_args, status, created_at) select ${lit(a.type)}, ${lit(a.account_id)}, ${lit(a.details)}, ${jsonb(a.tool_args)}, 'pending', now() - interval '${a.hours_ago} hours' where not exists (select 1 from sys.approvals where type = ${lit(a.type)} and account_id = ${lit(a.account_id)} and details = ${lit(a.details)} and status = 'pending');`,
  );
}

export function buildBatches(): { label: string; statements: string[] }[] {
  const agents = loadAgents();
  const packs = loadPacks();
  const batches: { label: string; statements: string[] }[] = [];
  PLANS.forEach((plan, idx) => {
    const agent = agents.find((a) => a.name === plan.name);
    if (!agent) throw new Error(`agents/${plan.name}/spec.yaml not found`);
    batches.push({ label: plan.name, statements: agentBatch(agent, plan, idx, packs) });
  });
  batches.push({ label: 'approvals', statements: approvalsBatch() });
  return batches;
}

async function main() {
  let batches = buildBatches();
  const only = flagValue('agent');
  if (only) batches = batches.filter((b) => b.label === only);
  if (hasFlag('approvals')) batches = batches.filter((b) => b.label === 'approvals');
  // --no-cleanup: drop the idempotency deletes (first apply on an empty DB, e.g. via an MCP that gates deletes)
  if (hasFlag('no-cleanup')) batches = batches.map((b) => ({ ...b, statements: b.statements.filter((st) => !st.startsWith('delete from')) }));

  if (hasFlag('sql')) {
    for (const b of batches) console.log(`-- ===== seed-history: ${b.label} =====\n${txn(b.statements)}\n`);
    return;
  }
  loadEnvLocal();
  const { closeSql, sql } = await import('../lib/db');
  try {
    for (const b of batches) {
      await sql.begin(async (tx) => {
        for (const st of b.statements) await tx.unsafe(st);
      });
      console.log(`seeded history: ${b.label} (${b.statements.length} statements)`);
    }
  } finally {
    await closeSql();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('seed-history failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
