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

// ---------- gate queue (fan-out: one serverless invocation per scenario attempt) ----------
// scenario_results.status only allows running/passed/failed/error, so a queued attempt is a 'running' row whose
// before_snapshot is the marker {"__gate":"queued","scenario":{...}}. Claiming flips __gate to "started" and
// resets created_at (the start time used by the stale sweeper). The final upsert overwrites before_snapshot.
export const GATE_MARK = '__gate';

export interface QueuedAttempt {
  scenario: string;
  attempt: number;
}

/** Inserts one queued row per attempt (ignores rows that already exist). */
export async function insertQueuedScenarioResults(
  agent: string,
  version: number,
  jobs: { scenario: { name: string; source?: ScenarioSource; pack?: string }; attempt: number }[],
): Promise<void> {
  for (let i = 0; i < jobs.length; i += 50) {
    const rows = jobs.slice(i, i + 50).map(({ scenario, attempt }) => {
      const inferred = inferScenarioSource(scenario.name);
      const source = scenario.source ?? inferred.source;
      return {
        agent,
        version,
        scenario: scenario.name,
        attempt,
        status: 'running',
        before_snapshot: json({ [GATE_MARK]: 'queued', scenario }),
        source,
        pack: scenario.pack ?? (source === 'pack' ? (inferred.pack ?? null) : null),
      };
    });
    await sql`
      insert into scenario_results ${sql(rows as never, 'agent', 'version', 'scenario', 'attempt', 'status', 'before_snapshot', 'source', 'pack')}
      on conflict (agent, version, scenario, attempt) do nothing`;
  }
}

/**
 * Atomically claims up to (limit - in-flight) queued attempts for a version. A transaction-scoped advisory lock
 * per version makes the in-flight bound hold across concurrent claimers (workers, the coordinator, GET polls).
 */
export async function claimQueuedScenarios(agent: string, version: number, limit: number): Promise<QueuedAttempt[]> {
  const out = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${`gate:${agent}@${version}`}))`;
    const counted = await tx`
      select count(*)::int as n from scenario_results
      where agent = ${agent} and version = ${version} and status = 'running'
        and (before_snapshot is null or before_snapshot->>'__gate' is distinct from 'queued')`;
    const free = limit - num(counted[0]?.n);
    if (free <= 0) return [] as QueuedAttempt[];
    const rows = await tx`
      update scenario_results
      set before_snapshot = jsonb_set(before_snapshot, '{__gate}', '"started"'), created_at = now()
      where id in (
        select id from scenario_results
        where agent = ${agent} and version = ${version} and status = 'running'
          and before_snapshot->>'__gate' = 'queued'
        order by id limit ${free}
        for update skip locked)
      returning scenario, attempt`;
    return rows.map((r) => ({ scenario: String(r.scenario), attempt: num(r.attempt) }));
  });
  return out as QueuedAttempt[];
}

/** Puts a claimed attempt back in the queue (its dispatch failed and there is no time left to run it inline). */
export async function unclaimScenario(agent: string, version: number, scenario: string, attempt: number): Promise<void> {
  await sql`
    update scenario_results set before_snapshot = jsonb_set(before_snapshot, '{__gate}', '"queued"')
    where agent = ${agent} and version = ${version} and scenario = ${scenario} and attempt = ${attempt}
      and status = 'running' and before_snapshot->>'__gate' = 'started'`;
}

/** A claimed attempt's scenario definition, or null when it is not in the 'started' state (done, queued, missing). */
export async function getStartedScenario(
  agent: string,
  version: number,
  scenario: string,
  attempt: number,
): Promise<Record<string, unknown> | null> {
  const rows = await sql`
    select before_snapshot->'scenario' as s from scenario_results
    where agent = ${agent} and version = ${version} and scenario = ${scenario} and attempt = ${attempt}
      and status = 'running' and before_snapshot->>'__gate' = 'started'`;
  return (rows[0]?.s as Record<string, unknown> | null) ?? null;
}

/** Counts of a version's attempts by queue state. */
export async function scenarioQueueCounts(
  agent: string,
  version: number,
): Promise<{ queued: number; inflight: number; done: number; total: number }> {
  const rows = await sql`
    select
      count(*) filter (where status = 'running' and before_snapshot->>'__gate' = 'queued')::int as queued,
      count(*) filter (where status = 'running' and (before_snapshot is null or before_snapshot->>'__gate' is distinct from 'queued'))::int as inflight,
      count(*) filter (where status <> 'running')::int as done,
      count(*)::int as total
    from scenario_results where agent = ${agent} and version = ${version}`;
  const r = rows[0] ?? {};
  return { queued: num(r.queued), inflight: num(r.inflight), done: num(r.done), total: num(r.total) };
}

/**
 * Stale sweeper: attempts in flight longer than `attemptSecs` become 'error'; when the version itself has been
 * running longer than `versionSecs`, every unfinished attempt (queued included) becomes 'error'. Returns rows swept.
 */
export async function sweepStaleScenarioResults(
  agent: string,
  version: number,
  attemptSecs: number,
  versionSecs: number,
): Promise<number> {
  const attemptMsg = `Gate error: this test's worker did not finish within ${Math.round(attemptSecs / 60)} minutes (timed out or crashed).`;
  const versionMsg = `Gate error: the gate did not finish within ${Math.round(versionSecs / 60)} minutes; this test never completed.`;
  const a = await sql`
    update scenario_results
    set status = 'error', final_reply = ${attemptMsg}, before_snapshot = null
    where agent = ${agent} and version = ${version} and status = 'running'
      and (before_snapshot is null or before_snapshot->>'__gate' is distinct from 'queued')
      and created_at < now() - make_interval(secs => ${attemptSecs})
    returning id`;
  const b = await sql`
    update scenario_results
    set status = 'error', final_reply = ${versionMsg}, before_snapshot = null
    where agent = ${agent} and version = ${version} and status = 'running'
      and exists (select 1 from agent_versions v where v.agent = ${agent} and v.version = ${version}
                  and v.started_at < now() - make_interval(secs => ${versionSecs}))
    returning id`;
  return a.length + b.length;
}

/** Sum of runs.cost_usd for the given run ids. */
export async function sumRunCosts(runIds: string[]): Promise<number> {
  const ids = [...new Set(runIds.filter(Boolean))];
  if (!ids.length) return 0;
  const rows = await sql`select coalesce(sum(cost_usd), 0) as c from runs where id::text in ${sql(ids)}`;
  return num(rows[0]?.c);
}

/** Idempotent finish: only moves a version out of 'running'. Returns true if this call did it. */
export async function finishVersionIfRunning(
  agent: string,
  version: number,
  result: { status: VersionStatus; pass_rate: number | null; total_cost_usd: number | null },
): Promise<boolean> {
  const rows = await sql`
    update agent_versions set status = ${result.status}, pass_rate = ${result.pass_rate},
      total_cost_usd = ${result.total_cost_usd}, finished_at = now()
    where agent = ${agent} and version = ${version} and status = 'running'
    returning version`;
  return rows.length > 0;
}

/**
 * The platform's total model spend. Counted from run_events.cost_usd (written per model step) so a run that dies
 * before finishRun still counts; per run it takes the larger of that and runs.cost_usd (rows without events).
 */
export async function totalSpendUsd(): Promise<number> {
  const rows = await sql`
    select coalesce(sum(greatest(coalesce(r.cost_usd, 0), coalesce(e.c, 0))), 0) as c
    from runs r
    left join (select run_id, sum(cost_usd) as c from run_events group by run_id) e on e.run_id = r.id`;
  return num(rows[0]?.c);
}

/** Tool-level events (tool_call / policy_block / approval) of many runs in one query (gate coverage on read). */
export async function listToolEventsForRuns(runIds: string[]): Promise<RunEvent[]> {
  // uuid[] literal keeps the run_events (run_id, seq) index usable; ids are validated so the literal is safe.
  const ids = [...new Set(runIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (!ids.length) return [];
  const rows = await sql`
    select seq, ts, type, name from run_events
    where run_id = any(${`{${ids.join(',')}}`}::uuid[]) and type in ('tool_call', 'policy_block', 'approval')`;
  return rows.map((r) => ({
    seq: num(r.seq),
    ts: iso(r.ts),
    type: r.type as EventType,
    name: strOrNull(r.name),
    payload: null,
    tokens_in: null,
    tokens_out: null,
    cost_usd: null,
    latency_ms: null,
  }));
}

// ---------- stress tests (dry runs; lib/stress) ----------
// No new table: a stress test lives in scenario_results under a NEGATIVE version number (stress_id "s7" = version -7),
// so it can never collide with real versions, never touches agent_versions/current_version and reuses the fan-out
// queue functions above unchanged. Its metadata sits in a header row (scenario '__stress__', attempt 0, status
// 'passed' so the queue treats it as terminal) under before_snapshot.__stress.
export const STRESS_SCENARIO = '__stress__';

export interface StressHeader {
  version: number;
  created_at: string;
  meta: Record<string, unknown>;
}

function toStressHeader(r: DbRow): StressHeader {
  const snap = (r.before_snapshot as Record<string, unknown> | null) ?? {};
  return { version: num(r.version), created_at: iso(r.created_at), meta: (snap.__stress as Record<string, unknown>) ?? {} };
}

/** Allocates the next negative version for the agent and writes the header row. Returns the version (< 0). */
export async function createStressHeader(agent: string, meta: Record<string, unknown>): Promise<number> {
  for (let tries = 0; tries < 5; tries++) {
    const rows = await sql`
      insert into scenario_results (agent, version, scenario, attempt, status, before_snapshot, final_reply, source)
      select ${agent}, coalesce(min(version), 0) - 1, ${STRESS_SCENARIO}, 0, 'passed',
             ${json({ __stress: meta })}, ${String(meta.headline ?? '')}, 'spec'
      from scenario_results where agent = ${agent} and version < 0
      on conflict (agent, version, scenario, attempt) do nothing
      returning version`;
    if (rows[0]) return num(rows[0].version);
  }
  throw new Error('could not allocate a stress id');
}

export async function getStressHeader(agent: string, version: number): Promise<StressHeader | null> {
  if (version >= 0) return null;
  const rows = await sql`
    select version, created_at, before_snapshot from scenario_results
    where agent = ${agent} and version = ${version} and scenario = ${STRESS_SCENARIO} and attempt = 0`;
  return rows[0] ? toStressHeader(rows[0]) : null;
}

/** Newest first. */
export async function listStressHeaders(agent: string, limit = 50): Promise<StressHeader[]> {
  const rows = await sql`
    select version, created_at, before_snapshot from scenario_results
    where agent = ${agent} and version < 0 and scenario = ${STRESS_SCENARIO} and attempt = 0
    order by version asc limit ${Math.min(Math.max(limit, 1), 200)}`;
  return rows.map(toStressHeader);
}

/**
 * Shallow-merges `patch` into the header metadata. With onlyIfRunning, applies only while meta.status is 'running'
 * (idempotent finalize: the first caller wins). Returns true if a row was updated.
 */
export async function updateStressMeta(
  agent: string,
  version: number,
  patch: Record<string, unknown>,
  opts: { onlyIfRunning?: boolean } = {},
): Promise<boolean> {
  const headline = typeof patch.headline === 'string' ? patch.headline : null;
  const rows = await sql`
    update scenario_results
    set before_snapshot = jsonb_set(coalesce(before_snapshot, '{}'::jsonb), '{__stress}',
                                    coalesce(before_snapshot->'__stress', '{}'::jsonb) || ${json(patch)}),
        final_reply = coalesce(${headline}, final_reply)
    where agent = ${agent} and version = ${version} and scenario = ${STRESS_SCENARIO} and attempt = 0
      and (${!opts.onlyIfRunning} or before_snapshot->'__stress'->>'status' = 'running')
    returning version`;
  return rows.length > 0;
}

/** Is a stress test of this agent still running (started within `withinSecs`)? */
export async function hasRunningStress(agent: string, withinSecs: number): Promise<boolean> {
  const rows = await sql`
    select 1 from scenario_results
    where agent = ${agent} and version < 0 and scenario = ${STRESS_SCENARIO} and attempt = 0
      and before_snapshot->'__stress'->>'status' = 'running'
      and created_at > now() - make_interval(secs => ${withinSecs})
    limit 1`;
  return rows.length > 0;
}

/** Stress-level timeout: once the stress is older than `secs`, every unfinished attempt becomes 'error'. */
export async function sweepStaleStress(agent: string, version: number, secs: number): Promise<number> {
  const msg = `Stress error: this attempt did not finish within ${Math.round(secs / 60)} minutes.`;
  const rows = await sql`
    update scenario_results
    set status = 'error', final_reply = ${msg}, before_snapshot = null
    where agent = ${agent} and version = ${version} and status = 'running' and scenario <> ${STRESS_SCENARIO}
      and exists (select 1 from scenario_results h
                  where h.agent = ${agent} and h.version = ${version} and h.scenario = ${STRESS_SCENARIO}
                    and h.attempt = 0 and h.created_at < now() - make_interval(secs => ${secs}))
    returning id`;
  return rows.length;
}

/** Cost and wall-clock duration (ms, null while unfinished) per run id. */
export async function runStats(runIds: string[]): Promise<Map<string, { cost_usd: number; duration_ms: number | null }>> {
  const ids = [...new Set(runIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  const out = new Map<string, { cost_usd: number; duration_ms: number | null }>();
  if (!ids.length) return out;
  const rows = await sql`
    select id::text as id, cost_usd, extract(epoch from (ended_at - started_at)) * 1000 as ms
    from runs where id = any(${`{${ids.join(',')}}`}::uuid[])`;
  for (const r of rows) out.set(String(r.id), { cost_usd: num(r.cost_usd), duration_ms: numOrNull(r.ms) });
  return out;
}
