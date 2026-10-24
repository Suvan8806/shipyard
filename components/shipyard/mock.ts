// In-browser mock backend for the dashboard (NEXT_PUBLIC_USE_MOCKS). Backed by lib/mock/fixtures.ts.
// Only components/shipyard/api.ts imports this file. State lives in module memory, so it survives client
// navigation and resets on a full reload.
import { parse as parseYaml } from 'yaml';
import {
  AGENTS,
  AGENT_DETAIL,
  APPROVALS,
  AUDIT,
  CATCH_RUN_ID,
  GATE_BLOCKED,
  GATE_LIVE,
  GENERATED_TESTS,
  LIBRARY,
  LIVE_RUN_ID,
  RUNS,
  RUN_TRACE,
  RUN_TRACE_CATCH,
  SUPPORT_SPEC_YAML,
} from '@/lib/mock/fixtures';
import type {
  AgentDetail,
  AgentSummary,
  Approval,
  AuditRow,
  ChatResponse,
  DecisionResponse,
  DeployResponse,
  GenerateTestsResponse,
  LibraryResponse,
  RollbackResponse,
  RunListItem,
  RunTrace,
  SimulateResponse,
  ValidateResponse,
  VersionSummary,
} from '@/lib/contracts/api';
import type { ChatMessage, GateResult, ScenarioResultSummary, ValidationError } from '@/lib/types';

/** How long a simulated gate run takes, end to end. */
export const SIM_GATE_MS = 8000;

const clone = <T>(v: T): T => structuredClone(v);

// ---------- state ----------
let agents: AgentSummary[] = clone(AGENTS);
let details: Record<string, AgentDetail> = { 'support-agent': clone(AGENT_DETAIL) };
let approvals: Approval[] = clone(APPROVALS);
let audit: AuditRow[] = clone(AUDIT);
let runs: RunListItem[] = clone(RUNS);
/** Gate simulations keyed by `${agent}@${version}`. */
let sims: Record<string, { startedAt: number; template: GateResult }> = {};
let auditSeq = 200;

function pushAudit(actor: string, action: string, target: string, detail: unknown) {
  auditSeq += 1;
  audit = [{ id: auditSeq, ts: new Date().toISOString(), actor, action, target, detail }, ...audit];
}

function summary(name: string): AgentSummary {
  const a = agents.find((x) => x.name === name);
  if (!a) throw new MockError('not_found', `agent ${name} not found`);
  return a;
}

function updateSummary(name: string, patch: Partial<AgentSummary>) {
  agents = agents.map((a) => (a.name === name ? { ...a, ...patch, updated_at: new Date().toISOString() } : a));
}

export class MockError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function genericSpec(a: AgentSummary): string {
  return `name: ${a.name}
goal: >
  ${a.goal ?? 'Help members.'}
profile: fast
inherit: [brand-tone, compliance]
tools: [accounts.get, crm.add_note]
instructions: |
  Answer in plain language. Log a CRM note for anything you could not resolve.
test_packs: [security, read-only]
gate:
  min_pass_rate: 1.0
  runs_per_scenario: 1
  variants: 0
`;
}

function detail(name: string): AgentDetail {
  const existing = details[name];
  if (existing) return existing;
  const a = summary(name);
  const versions: VersionSummary[] = [];
  const latest = a.latest_version ?? 0;
  for (let v = latest; v >= 1; v -= 1) {
    const isLatest = v === latest;
    const status = isLatest ? (a.latest_status === 'draft' ? 'live' : a.latest_status) : v === a.current_version ? 'live' : 'live';
    const started = new Date(Date.parse(a.updated_at) - (latest - v) * 86_400_000 - 72_000).toISOString();
    versions.push({
      version: v,
      status: v < (a.current_version ?? 0) ? 'live' : status,
      pass_rate: isLatest ? a.pass_rate : 1,
      total_cost_usd: 0.31 + v * 0.02,
      started_at: started,
      finished_at: status === 'running' ? null : new Date(Date.parse(started) + 71_000).toISOString(),
    });
  }
  const d: AgentDetail = {
    name: a.name,
    team: a.team,
    owner: a.owner,
    current_version: a.current_version,
    draft_spec_yaml: genericSpec(a),
    draft_scenarios: {},
    validation: { ok: true, errors: [] },
    versions,
  };
  details = { ...details, [name]: d };
  return d;
}

// ---------- agents ----------
export function getAgents(): AgentSummary[] {
  return clone(agents);
}

export function getAgent(name: string): AgentDetail {
  return clone(detail(name));
}

const KNOWN_TOOLS = new Set(LIBRARY.tools.map((t) => t.name));
const KNOWN_BLOCKS = new Set(LIBRARY.blocks.map((b) => b.name));
const KNOWN_PACKS = new Set(LIBRARY.packs.map((p) => p.name));
const KNOWN_PROFILES = new Set(Object.keys(LIBRARY.profiles));

/** Lightweight client-side validation that mimics lib/spec/validate.ts error paths. */
export function validateYaml(yaml: string): ValidateResponse {
  const errors: ValidationError[] = [];
  let doc: unknown;
  try {
    doc = parseYaml(yaml);
  } catch (e) {
    return { ok: false, errors: [{ path: '(yaml)', message: e instanceof Error ? e.message.split('\n')[0] : 'Invalid YAML' }] };
  }
  if (!doc || typeof doc !== 'object') return { ok: false, errors: [{ path: '(root)', message: 'Spec must be a mapping' }] };
  const s = doc as Record<string, unknown>;
  for (const key of ['name', 'goal', 'profile', 'tools', 'instructions']) {
    if (s[key] === undefined || s[key] === null || s[key] === '') errors.push({ path: key, message: `${key} is required` });
  }
  if (typeof s.name === 'string' && !/^[a-z0-9-]+$/.test(s.name)) {
    errors.push({ path: 'name', message: 'Use lowercase letters, digits and dashes' });
  }
  if (typeof s.profile === 'string' && !KNOWN_PROFILES.has(s.profile)) {
    errors.push({ path: 'profile', message: `Unknown profile "${s.profile}" (have: ${[...KNOWN_PROFILES].join(', ')})` });
  }
  const list = (key: string, known: Set<string>, kind: string) => {
    const v = s[key];
    if (v === undefined) return;
    if (!Array.isArray(v)) {
      errors.push({ path: key, message: `${key} must be a list` });
      return;
    }
    v.forEach((item, i) => {
      if (typeof item !== 'string' || !known.has(item)) {
        errors.push({ path: `${key}[${i}]`, message: `Unknown ${kind} "${String(item)}"` });
      }
    });
  };
  list('tools', KNOWN_TOOLS, 'tool');
  list('inherit', KNOWN_BLOCKS, 'block');
  list('test_packs', KNOWN_PACKS, 'test pack');
  const gate = s.gate as Record<string, unknown> | undefined;
  if (gate && typeof gate === 'object') {
    const r = gate.min_pass_rate;
    if (typeof r !== 'number' || r < 0 || r > 1) errors.push({ path: 'gate.min_pass_rate', message: 'Must be a number from 0 to 1' });
  }
  return { ok: errors.length === 0, errors };
}

export function saveSpec(name: string, specYaml: string): ValidateResponse {
  const result = validateYaml(specYaml);
  const d = detail(name);
  details = { ...details, [name]: { ...d, draft_spec_yaml: specYaml, validation: result } };
  return result;
}

export function acceptScenarios(name: string, scenarios: Record<string, string>) {
  const d = detail(name);
  details = { ...details, [name]: { ...d, draft_scenarios: { ...d.draft_scenarios, ...scenarios } } };
}

// ---------- gate ----------
function relabel(template: GateResult, agent: string, version: number, current: number | null): GateResult {
  return { ...clone(template), agent, version, current_version: current };
}

/** The fixed gate result for a version (no simulation). */
function staticGate(name: string, v: number): GateResult {
  const a = summary(name);
  if (name === 'support-agent' && v === 1) return clone(GATE_LIVE);
  if (name === 'support-agent' && v === 2) return clone(GATE_BLOCKED);
  const ver = detail(name).versions.find((x) => x.version === v);
  if (!ver) throw new MockError('not_found', `${name} has no version ${v}`);
  const base = ver.status === 'blocked' ? GATE_BLOCKED : GATE_LIVE;
  const g = relabel(base, name, v, a.current_version);
  return { ...g, status: ver.status, started_at: ver.started_at, finished_at: ver.finished_at };
}

function progress(sim: { startedAt: number; template: GateResult }, now: number): GateResult {
  const t = sim.template;
  const elapsed = now - sim.startedAt;
  const n = t.results.length;
  const finishAt = (i: number) => {
    // deterministic spread: stagger across ~85% of the window, with a little jitter
    const jitter = ((i * 7919) % 13) * 90;
    return Math.min(SIM_GATE_MS - 400, 600 + (i / n) * (SIM_GATE_MS * 0.82) + jitter);
  };
  const results: ScenarioResultSummary[] = t.results.map((r, i) =>
    elapsed >= finishAt(i)
      ? r
      : { ...r, status: 'running', assertions: [], reply_check: null, final_reply: null, diff: null },
  );
  const done = elapsed >= SIM_GATE_MS;
  if (!done) {
    return {
      ...t,
      status: 'running',
      pass_rate: null,
      total_cost_usd: null,
      finished_at: null,
      results,
      coverage: null,
    };
  }
  return { ...t, finished_at: new Date(sim.startedAt + SIM_GATE_MS).toISOString() };
}

function settleIfDone(key: string, name: string, v: number) {
  const sim = sims[key];
  if (!sim || Date.now() - sim.startedAt < SIM_GATE_MS) return;
  const t = sim.template;
  const d = detail(name);
  const already = d.versions.find((x) => x.version === v);
  if (already && already.status !== 'running') return;
  const newCurrent = t.status === 'live' ? v : d.current_version;
  details = {
    ...details,
    [name]: {
      ...d,
      current_version: newCurrent,
      versions: d.versions.map((x) =>
        x.version === v
          ? { ...x, status: t.status, pass_rate: t.pass_rate, total_cost_usd: t.total_cost_usd, finished_at: new Date().toISOString() }
          : x,
      ),
    },
  };
  updateSummary(name, { latest_status: t.status, pass_rate: t.pass_rate, current_version: newCurrent });
  const failed = t.results.filter((r) => r.status === 'failed').map((r) => r.scenario);
  pushAudit('gate', t.status, `${name}@v${v}`, { pass_rate: t.pass_rate, tests: t.results.length, failed });
}

export function getGate(name: string, v: number): GateResult {
  const key = `${name}@${v}`;
  const sim = sims[key];
  if (!sim) return staticGate(name, v);
  settleIfDone(key, name, v);
  return progress(sim, Date.now());
}

function templateFor(name: string, v: number, specYaml: string): GateResult {
  const a = summary(name);
  // The demo bug: the 30-day rule was removed from the instructions -> end-state failure.
  const blocked = name === 'support-agent' ? !specYaml.includes('credits_last_30_days') : false;
  const base = blocked ? GATE_BLOCKED : GATE_LIVE;
  const startedAt = new Date().toISOString();
  return { ...relabel(base, name, v, a.current_version), status: blocked ? 'blocked' : 'live', started_at: startedAt };
}

export function deploy(name: string): DeployResponse {
  const d = detail(name);
  const a = summary(name);
  const v = Math.max(a.latest_version ?? 0, ...d.versions.map((x) => x.version)) + 1;
  const template = templateFor(name, v, d.draft_spec_yaml);
  sims = { ...sims, [`${name}@${v}`]: { startedAt: Date.now(), template } };
  const row: VersionSummary = {
    version: v,
    status: 'running',
    pass_rate: null,
    total_cost_usd: null,
    started_at: template.started_at,
    finished_at: null,
  };
  details = { ...details, [name]: { ...d, versions: [row, ...d.versions] } };
  updateSummary(name, { latest_version: v, latest_status: 'running', pass_rate: null });
  pushAudit('Maya Ortiz', 'deploy', `${name}@v${v}`, { via: 'dashboard', tests: template.results.length });
  return { version: v, status: 'running' };
}

/** Demo helper: re-run an existing version's gate as a live ~8 s animation (same final result). */
export function replayGate(name: string, v: number): void {
  const template = { ...staticGate(name, v), started_at: new Date().toISOString() };
  sims = { ...sims, [`${name}@${v}`]: { startedAt: Date.now(), template } };
}

export function rollback(name: string): RollbackResponse {
  const d = detail(name);
  const live = d.versions.filter((x) => x.status === 'live' && x.version !== d.current_version).map((x) => x.version);
  const target = live.length ? Math.max(...live) : (d.current_version ?? 1);
  details = { ...details, [name]: { ...d, current_version: target } };
  updateSummary(name, { current_version: target });
  pushAudit('Maya Ortiz', 'rollback', name, { from: d.current_version, to: target });
  return { current_version: target };
}

// ---------- chat ----------
export function chat(name: string, messages: ChatMessage[]): ChatResponse {
  const last = messages[messages.length - 1]?.content.toLowerCase() ?? '';
  let reply = "Thanks for reaching out! I've looked at your account and everything is in good standing. Anything else I can help with?";
  if (last.includes('fee') || last.includes('waive')) {
    reply = "I'm sorry about that fee. I checked your account and you haven't had a credit in the last 30 days, so I've applied a $25 goodwill credit and added a note.";
  } else if (last.includes('skip') || last.includes('defer')) {
    reply = "I can't change a payment directly, but I've sent a deferral request for review. You'll hear back within one business day.";
  } else if (last.includes('balance')) {
    reply = 'Your current balance is $412.00 and your next payment of $412.00 is due November 1.';
  }
  const id = crypto.randomUUID();
  const cost = 0.011 + Math.random() * 0.006;
  runs = [
    { id, agent: name, version: summary(name).current_version, mode: 'live', scenario: null, started_at: new Date().toISOString(), cost_usd: cost, outcome: 'ok', preview: reply.slice(0, 140) },
    ...runs,
  ];
  return { run_id: id, reply, cost_usd: cost };
}

export function generateTests(): GenerateTestsResponse {
  return { scenarios: clone(GENERATED_TESTS) };
}

// ---------- runs ----------
export function getRuns(opts: { limit?: number; agent?: string } = {}): RunListItem[] {
  const filtered = opts.agent ? runs.filter((r) => r.agent === opts.agent) : runs;
  return clone(filtered.slice(0, opts.limit ?? 50));
}

function findGateResult(id: string): { gate: GateResult; result: ScenarioResultSummary } | null {
  for (const gate of [GATE_BLOCKED, GATE_LIVE] as GateResult[]) {
    const result = gate.results.find((r) => r.run_id === id);
    if (result) return { gate, result };
  }
  return null;
}

export function getRun(id: string): RunTrace {
  if (id === CATCH_RUN_ID) return clone(RUN_TRACE_CATCH);
  if (id === LIVE_RUN_ID) return clone(RUN_TRACE);
  const hit = findGateResult(id);
  if (hit) {
    const { gate, result } = hit;
    const started = gate.started_at;
    const ended = new Date(Date.parse(started) + 6400).toISOString();
    return {
      run: {
        id,
        agent: gate.agent,
        version: gate.version,
        mode: 'scenario',
        scenario: result.scenario,
        started_at: started,
        ended_at: ended,
        cost_usd: 0.0138,
        tokens_in: 2980,
        tokens_out: 214,
        outcome: 'ok',
        final_reply: result.final_reply,
      },
      events: [
        { seq: 1, ts: new Date(Date.parse(started) + 1200).toISOString(), type: 'model_call', name: 'groq/openai/gpt-oss-120b', payload: { model: 'groq/openai/gpt-oss-120b', step: 1, tool_calls: ['accounts.get'], finish_reason: 'tool-calls' }, tokens_in: 1010, tokens_out: 38, cost_usd: 0.0041, latency_ms: 980 },
        { seq: 2, ts: new Date(Date.parse(started) + 1290).toISOString(), type: 'tool_call', name: 'accounts.get', payload: { args: { account_id: 'A-100' }, result: { id: 'A-100', owner: 'Dana Lee', balance: 412, credits_last_30_days: [] } }, tokens_in: null, tokens_out: null, cost_usd: null, latency_ms: 41 },
        { seq: 3, ts: new Date(Date.parse(started) + 6300).toISOString(), type: 'model_call', name: 'groq/openai/gpt-oss-120b', payload: { model: 'groq/openai/gpt-oss-120b', step: 2, text: result.final_reply, finish_reason: 'stop' }, tokens_in: 1970, tokens_out: 176, cost_usd: 0.0097, latency_ms: 2210 },
      ],
      diff: result.diff ?? {},
      before_snapshot: null,
      after_snapshot: null,
    };
  }
  const item = runs.find((r) => r.id === id);
  if (!item) throw new MockError('not_found', `run ${id} not found`);
  const base = clone(RUN_TRACE);
  return {
    ...base,
    run: { ...base.run, id, agent: item.agent, version: item.version, started_at: item.started_at, cost_usd: item.cost_usd, outcome: item.outcome, final_reply: item.preview },
  };
}

// ---------- library / approvals / audit ----------
export function getLibrary(): LibraryResponse {
  return clone(LIBRARY);
}

export function getApprovals(status?: Approval['status']): Approval[] {
  return clone(status ? approvals.filter((a) => a.status === status) : approvals);
}

export function decide(id: number, decision: 'approve' | 'reject'): DecisionResponse {
  const status = decision === 'approve' ? 'approved' : 'rejected';
  if (!approvals.some((a) => a.id === id)) throw new MockError('not_found', `approval ${id} not found`);
  approvals = approvals.map((a) => (a.id === id ? { ...a, status, decided_at: new Date().toISOString() } : a));
  pushAudit('Maya Ortiz', `approval.${status}`, `approval#${id}`, {});
  return { status };
}

export function getAudit(): AuditRow[] {
  return clone(audit);
}

// ---------- simulate traffic ----------
const SIM_LINES: { agent: string; preview: string; outcome?: string; block?: boolean; approval?: boolean }[] = [
  { agent: 'support-agent', preview: "I've applied a $25 goodwill credit for the late fee and noted your account.", block: true },
  { agent: 'collections-agent', preview: "I've logged today's contact and emailed your payment options to the address on file." },
  { agent: 'loan-status-agent', preview: 'Your auto loan balance is $1,842.10. The next payment of $560.00 is due November 3.' },
  { agent: 'support-agent', preview: "I've sent your request to skip December's payment for review.", approval: true },
  { agent: 'branch-hours-agent', preview: 'The Cedar Park branch is closed on Thanksgiving and opens at 9 on Friday.' },
  { agent: 'fraud-alert-agent', preview: "Thanks for confirming. I've frozen the card and a fraud specialist will call within the hour." },
  { agent: 'fee-explainer-agent', preview: 'That $3 charge is an out-of-network ATM fee. I added a note that you disputed it.' },
  { agent: 'card-dispute-agent', preview: "I've recorded the dispute for the $89.40 charge and routed it for approval.", approval: true },
];
let simCursor = 0;

export function simulateTraffic(count: number): SimulateResponse {
  let cost = 0;
  let blocks = 0;
  let approvalsMade = 0;
  const now = Date.now();
  const fresh: RunListItem[] = [];
  for (let i = 0; i < count; i += 1) {
    const line = SIM_LINES[simCursor % SIM_LINES.length];
    simCursor += 1;
    const c = 0.003 + ((simCursor * 37) % 11) / 1000;
    cost += c;
    if (line.block) blocks += 1;
    if (line.approval) approvalsMade += 1;
    const a = agents.find((x) => x.name === line.agent);
    fresh.push({
      id: crypto.randomUUID(),
      agent: line.agent,
      version: a?.current_version ?? 1,
      mode: 'live',
      scenario: null,
      started_at: new Date(now - (count - i) * 700).toISOString(),
      cost_usd: c,
      outcome: line.outcome ?? 'ok',
      preview: line.preview,
    });
  }
  runs = [...fresh.reverse(), ...runs];
  agents = agents.map((a) => {
    const n = fresh.filter((r) => r.agent === a.name).length;
    return n ? { ...a, runs_24h: a.runs_24h + n } : a;
  });
  pushAudit('Maya Ortiz', 'simulate', 'live traffic', { runs: count, policy_blocks: blocks, approvals: approvalsMade });
  return { runs: count, cost_usd: Number(cost.toFixed(4)), policy_blocks: blocks, approvals: approvalsMade };
}

export const SUPPORT_FIXED_SPEC = SUPPORT_SPEC_YAML;
