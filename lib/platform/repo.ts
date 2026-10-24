// Thin typed CRUD over the platform tables in Supabase `public` (PRD 9.2).
// Owned by O0. Used by Lanes A (runs/events), B (versions/scenario_results) and C (everything).
// Nothing clever: one function per query. Numeric columns -> Number(), timestamps -> ISO strings.
import { sql } from '../db';
import type {
  AssertionOutcome,
  EventType,
  ReplyCheck,
  RunEvent,
  RunMode,
  RunRow,
  ScenarioResultSummary,
  ScenarioSource,
  ScenarioStatus,
  Snapshot,
  TwinDiff,
  VersionStatus,
} from '../types';
import type { AgentSummary, AuditRow, RunListItem, VersionSummary } from '../contracts/api';

// ---------- helpers ----------
type DbRow = Record<string, unknown>;

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const isoOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : iso(v));
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
// postgres.js JSON helper typing is strict; jsonb params go through this.
const json = (v: unknown) => sql.json(v as never);

/** Source + pack from a scenario name (see the naming convention in lib/types.ts). */
export function inferScenarioSource(name: string): { source: ScenarioSource; pack?: string } {
  const slash = name.indexOf('/');
  if (slash > 0) return { source: 'pack', pack: name.slice(0, slash) };
  if (name.startsWith('gen-')) return { source: 'generated' };
  return { source: 'spec' };
}

// ---------- agents ----------
export interface AgentRow {
  name: string;
  current_version: number | null;
  draft_spec_yaml: string;
  draft_scenarios: Record<string, string>;
  team: string | null;
  owner: string | null;
  created_at: string;
  updated_at: string;
}

function toAgent(r: DbRow): AgentRow {
  return {
    name: String(r.name),
    current_version: numOrNull(r.current_version),
    draft_spec_yaml: String(r.draft_spec_yaml ?? ''),
    draft_scenarios: (r.draft_scenarios as Record<string, string>) ?? {},
    team: strOrNull(r.team),
    owner: strOrNull(r.owner),
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  };
}

export async function getAgent(name: string): Promise<AgentRow | null> {
  const rows = await sql`select * from agents where name = ${name}`;
  return rows[0] ? toAgent(rows[0]) : null;
}

export async function listAgents(): Promise<AgentRow[]> {
  const rows = await sql`select * from agents order by name`;
  return rows.map(toAgent);
}

/** AgentSummary rows for GET /api/agents (latest version, pass rate, avg live cost, runs in 24h). */
export async function listAgentSummaries(): Promise<AgentSummary[]> {
  const rows = await sql`
    select a.name, a.team, a.owner, a.current_version, a.updated_at, a.draft_spec_yaml,
           lv.version as latest_version, lv.status as latest_status, lv.pass_rate,
           (select avg(r.cost_usd) from runs r where r.agent = a.name and r.mode = 'live') as avg_cost_usd,
           (select count(*) from runs r where r.agent = a.name and r.started_at > now() - interval '24 hours') as runs_24h
    from agents a
    left join lateral (
      select version, status, pass_rate from agent_versions v where v.agent = a.name order by version desc limit 1
    ) lv on true
    order by a.name`;
  return rows.map((r) => {
    const goalMatch = /^goal:\s*>?\s*\n?\s*(.+)$/m.exec(String(r.draft_spec_yaml ?? ''));
    return {
      name: String(r.name),
      team: strOrNull(r.team),
      owner: strOrNull(r.owner),
      goal: goalMatch ? goalMatch[1].trim() : null,
      current_version: numOrNull(r.current_version),
      latest_version: numOrNull(r.latest_version),
      latest_status: (r.latest_status as VersionStatus | null) ?? 'draft',
      pass_rate: numOrNull(r.pass_rate),
      avg_cost_usd: numOrNull(r.avg_cost_usd),
      runs_24h: num(r.runs_24h),
      updated_at: iso(r.updated_at),
    };
  });
}

export async function upsertAgentDraft(input: {
  name: string;
  draft_spec_yaml: string;
  draft_scenarios?: Record<string, string>;
  team?: string | null;
  owner?: string | null;
}): Promise<AgentRow> {
  const rows = await sql`
    insert into agents (name, draft_spec_yaml, draft_scenarios, team, owner)
    values (${input.name}, ${input.draft_spec_yaml}, ${json(input.draft_scenarios ?? {})},
            ${input.team ?? null}, ${input.owner ?? null})
    on conflict (name) do update set
      draft_spec_yaml = excluded.draft_spec_yaml,
      draft_scenarios = case when ${input.draft_scenarios === undefined} then agents.draft_scenarios
                             else excluded.draft_scenarios end,
      team = coalesce(excluded.team, agents.team),
      owner = coalesce(excluded.owner, agents.owner),
      updated_at = now()
    returning *`;
  return toAgent(rows[0]);
}

export async function setCurrentVersion(name: string, version: number | null): Promise<void> {
  await sql`update agents set current_version = ${version}, updated_at = now() where name = ${name}`;
}

// ---------- versions ----------
export interface VersionRow {
  agent: string;
  version: number;
  spec_yaml: string;
  scenarios: Record<string, string>;
  spec_hash: string | null;
  status: VersionStatus;
  pass_rate: number | null;
  total_cost_usd: number | null;
  started_at: string;
  finished_at: string | null;
}

function toVersion(r: DbRow): VersionRow {
  return {
    agent: String(r.agent),
    version: num(r.version),
    spec_yaml: String(r.spec_yaml ?? ''),
    scenarios: (r.scenarios as Record<string, string>) ?? {},
    spec_hash: strOrNull(r.spec_hash),
    status: r.status as VersionStatus,
    pass_rate: numOrNull(r.pass_rate),
    total_cost_usd: numOrNull(r.total_cost_usd),
    started_at: iso(r.started_at),
    finished_at: isoOrNull(r.finished_at),
  };
}

export async function nextVersion(agent: string): Promise<number> {
  const rows = await sql`select coalesce(max(version), 0) + 1 as v from agent_versions where agent = ${agent}`;
  return num(rows[0]?.v ?? 1);
}

export async function createVersion(input: {
  agent: string;
  version: number;
  spec_yaml: string;
  scenarios: Record<string, string>;
  spec_hash?: string | null;
  status?: VersionStatus;
}): Promise<VersionRow> {
  const rows = await sql`
    insert into agent_versions (agent, version, spec_yaml, scenarios, spec_hash, status)
    values (${input.agent}, ${input.version}, ${input.spec_yaml}, ${json(input.scenarios)},
            ${input.spec_hash ?? null}, ${input.status ?? 'running'})
    returning *`;
  return toVersion(rows[0]);
}

export async function finishVersion(
  agent: string,
  version: number,
  result: { status: VersionStatus; pass_rate: number | null; total_cost_usd: number | null },
): Promise<void> {
  await sql`
    update agent_versions set status = ${result.status}, pass_rate = ${result.pass_rate},
      total_cost_usd = ${result.total_cost_usd}, finished_at = now()
    where agent = ${agent} and version = ${version}`;
}

export async function listVersions(agent: string): Promise<VersionSummary[]> {
  const rows = await sql`
    select version, status, pass_rate, total_cost_usd, started_at, finished_at
    from agent_versions where agent = ${agent} order by version desc`;
  return rows.map((r) => ({
    version: num(r.version),
    status: r.status as VersionStatus,
    pass_rate: numOrNull(r.pass_rate),
    total_cost_usd: numOrNull(r.total_cost_usd),
    started_at: iso(r.started_at),
    finished_at: isoOrNull(r.finished_at),
  }));
}

export async function getVersion(agent: string, version: number): Promise<VersionRow | null> {
  const rows = await sql`select * from agent_versions where agent = ${agent} and version = ${version}`;
  return rows[0] ? toVersion(rows[0]) : null;
}

/** Most recent finished (live or blocked) version with this spec hash, for the demo replay cache. */
export async function findVersionByHash(agent: string, specHash: string): Promise<VersionRow | null> {
  const rows = await sql`
    select * from agent_versions
    where agent = ${agent} and spec_hash = ${specHash} and status in ('live', 'blocked')
    order by version desc limit 1`;
  return rows[0] ? toVersion(rows[0]) : null;
}

// ---------- runs + events ----------
function toRun(r: DbRow): RunRow {
  return {
    id: String(r.id),
    agent: String(r.agent),
    version: numOrNull(r.version),
    mode: r.mode as RunMode,
    scenario: strOrNull(r.scenario),
    started_at: iso(r.started_at),
    ended_at: isoOrNull(r.ended_at),
    cost_usd: num(r.cost_usd),
    tokens_in: num(r.tokens_in),
    tokens_out: num(r.tokens_out),
    outcome: strOrNull(r.outcome),
    final_reply: strOrNull(r.final_reply),
  };
}

export async function createRun(input: {
  agent: string;
  version: number | null;
  mode: RunMode;
  scenario?: string | null;
}): Promise<RunRow> {
  const rows = await sql`
    insert into runs (agent, version, mode, scenario)
    values (${input.agent}, ${input.version}, ${input.mode}, ${input.scenario ?? null})
    returning *`;
  return toRun(rows[0]);
}

export async function finishRun(
  id: string,
  result: { cost_usd: number; tokens_in: number; tokens_out: number; outcome: string; final_reply: string | null },
): Promise<void> {
  await sql`
    update runs set ended_at = now(), cost_usd = ${result.cost_usd}, tokens_in = ${result.tokens_in},
      tokens_out = ${result.tokens_out}, outcome = ${result.outcome}, final_reply = ${result.final_reply}
    where id = ${id}`;
}

/** Appends an event with seq = max(seq)+1 for the run. Returns the assigned seq. */
export async function appendEvent(
  runId: string,
  event: {
    type: EventType;
    name?: string | null;
    payload?: unknown;
    tokens_in?: number | null;
    tokens_out?: number | null;
    cost_usd?: number | null;
    latency_ms?: number | null;
  },
): Promise<number> {
  const rows = await sql`
    insert into run_events (run_id, seq, type, name, payload, tokens_in, tokens_out, cost_usd, latency_ms)
    select ${runId}, coalesce(max(seq), 0) + 1, ${event.type}, ${event.name ?? null},
           ${json(event.payload ?? null)}, ${event.tokens_in ?? null}, ${event.tokens_out ?? null},
           ${event.cost_usd ?? null}, ${event.latency_ms ?? null}
    from run_events where run_id = ${runId}
    returning seq`;
  return num(rows[0]?.seq);
}

export async function getRun(id: string): Promise<RunRow | null> {
  const rows = await sql`select * from runs where id = ${id}`;
  return rows[0] ? toRun(rows[0]) : null;
}

export async function listEvents(runId: string): Promise<RunEvent[]> {
  const rows = await sql`select * from run_events where run_id = ${runId} order by seq`;
  return rows.map((r) => ({
    seq: num(r.seq),
    ts: iso(r.ts),
    type: r.type as EventType,
    name: strOrNull(r.name),
    payload: r.payload ?? null,
    tokens_in: numOrNull(r.tokens_in),
    tokens_out: numOrNull(r.tokens_out),
    cost_usd: numOrNull(r.cost_usd),
    latency_ms: numOrNull(r.latency_ms),
  }));
}

export async function listRuns(opts: { limit?: number; agent?: string; mode?: RunMode } = {}): Promise<RunListItem[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const rows = await sql`
    select id, agent, version, mode, scenario, started_at, cost_usd, outcome, final_reply
    from runs
    where (${opts.agent ?? null}::text is null or agent = ${opts.agent ?? null})
      and (${opts.mode ?? null}::text is null or mode = ${opts.mode ?? null})
    order by started_at desc limit ${limit}`;
  return rows.map((r) => ({
    id: String(r.id),
    agent: String(r.agent),
    version: numOrNull(r.version),
    mode: r.mode as RunMode,
    scenario: strOrNull(r.scenario),
    started_at: iso(r.started_at),
    cost_usd: num(r.cost_usd),
    outcome: strOrNull(r.outcome),
    preview: r.final_reply ? String(r.final_reply).slice(0, 140) : null,
  }));
}

// ---------- scenario results ----------
export interface ScenarioResultInput {
  agent: string;
  version: number;
  scenario: string;
  attempt: number;
  status: ScenarioStatus;
  run_id?: string | null;
  assertions?: AssertionOutcome[];
  reply_check?: ReplyCheck | null;
  final_reply?: string | null;
  diff?: TwinDiff | null;
  before_snapshot?: Snapshot | null;
  after_snapshot?: Snapshot | null;
  /** Defaults to the naming convention (inferScenarioSource) when omitted. */
  source?: ScenarioSource;
  pack?: string | null;
}

/** Insert or replace by (agent, version, scenario, attempt). */
export async function upsertScenarioResult(r: ScenarioResultInput): Promise<void> {
  const inferred = inferScenarioSource(r.scenario);
  const source = r.source ?? inferred.source;
  const pack = r.pack ?? (source === 'pack' ? (inferred.pack ?? null) : null);
  await sql`
    insert into scenario_results (agent, version, scenario, attempt, run_id, status, assertions, reply_check,
                                  final_reply, diff, before_snapshot, after_snapshot, source, pack)
    values (${r.agent}, ${r.version}, ${r.scenario}, ${r.attempt}, ${r.run_id ?? null}, ${r.status},
            ${json(r.assertions ?? [])}, ${json(r.reply_check ?? null)}, ${r.final_reply ?? null},
            ${json(r.diff ?? null)}, ${json(r.before_snapshot ?? null)}, ${json(r.after_snapshot ?? null)},
            ${source}, ${pack})
    on conflict (agent, version, scenario, attempt) do update set
      run_id = excluded.run_id, status = excluded.status, assertions = excluded.assertions,
      reply_check = excluded.reply_check, final_reply = excluded.final_reply, diff = excluded.diff,
      before_snapshot = excluded.before_snapshot, after_snapshot = excluded.after_snapshot,
      source = excluded.source, pack = excluded.pack, created_at = now()`;
}

export async function listScenarioResults(agent: string, version: number): Promise<ScenarioResultSummary[]> {
  const rows = await sql`
    select scenario, attempt, status, run_id, assertions, reply_check, final_reply, diff, source, pack
    from scenario_results where agent = ${agent} and version = ${version}
    order by scenario, attempt`;
  return rows.map((r) => {
    const inferred = inferScenarioSource(String(r.scenario));
    const source = (r.source as ScenarioSource | null) ?? inferred.source;
    const pack = strOrNull(r.pack) ?? inferred.pack;
    return {
      scenario: String(r.scenario),
      attempt: num(r.attempt),
      status: r.status as ScenarioStatus,
      run_id: strOrNull(r.run_id),
      assertions: (r.assertions as AssertionOutcome[]) ?? [],
      reply_check: (r.reply_check as ReplyCheck | null) ?? null,
      final_reply: strOrNull(r.final_reply),
      diff: (r.diff as TwinDiff | null) ?? null,
      source,
      ...(source === 'pack' && pack ? { pack } : {}),
    };
  });
}

/** Diff + snapshots (+ source/pack) for a scenario run (RunTrace). Null for live runs. */
export async function getScenarioResultByRun(runId: string): Promise<{
  diff: TwinDiff | null;
  before_snapshot: Snapshot | null;
  after_snapshot: Snapshot | null;
  source: ScenarioSource;
  pack: string | null;
} | null> {
  const rows = await sql`
    select scenario, diff, before_snapshot, after_snapshot, source, pack
    from scenario_results where run_id = ${runId} limit 1`;
  if (!rows[0]) return null;
  const inferred = inferScenarioSource(String(rows[0].scenario));
  return {
    source: (rows[0].source as ScenarioSource | null) ?? inferred.source,
    pack: strOrNull(rows[0].pack) ?? inferred.pack ?? null,
    diff: (rows[0].diff as TwinDiff | null) ?? null,
    before_snapshot: (rows[0].before_snapshot as Snapshot | null) ?? null,
    after_snapshot: (rows[0].after_snapshot as Snapshot | null) ?? null,
  };
}

// ---------- audit ----------
export async function audit(actor: string, action: string, target: string | null, detail?: unknown): Promise<void> {
  await sql`
    insert into audit_log (actor, action, target, detail)
    values (${actor}, ${action}, ${target}, ${json(detail ?? null)})`;
}

export async function listAudit(limit = 100): Promise<AuditRow[]> {
  const rows = await sql`select * from audit_log order by ts desc limit ${Math.min(Math.max(limit, 1), 500)}`;
  return rows.map((r) => ({
    id: num(r.id),
    ts: iso(r.ts),
    actor: String(r.actor),
    action: String(r.action),
    target: strOrNull(r.target),
    detail: r.detail ?? null,
  }));
}

/** Deploys (agent_versions rows) created since `since`, across all agents. For SHIPYARD_MAX_DEPLOYS_PER_HOUR. */
export async function countDeploysSince(since: Date): Promise<number> {
  const rows = await sql`select count(*) as n from agent_versions where started_at > ${since}`;
  return num(rows[0]?.n);
}
