// The gate (PRD 12): every scenario attempt on its own throwaway twin, end state checked with structured
// assertions, majority vote, then live or blocked. Results stream into scenario_results as they finish.
import type { LanguageModel } from 'ai';
import * as repo from '../platform/repo';
import { runAgent } from '../runtime/runner';
import { createTwin } from '../twins/twin';
import { diffSnapshots } from '../twins/diff';
import type {
  AgentSpec,
  AssertionOutcome,
  GateResult,
  ReplyCheck,
  RunEvent,
  RunGateFn,
  Scenario,
  ScenarioResultSummary,
  ScenarioStatus,
  Snapshot,
  SystemDb,
  TwinDiff,
  VersionStatus,
} from '../types';
import { evaluateAssertions } from './assertions';
import { computeCoverage } from './coverage';
import { expandTestPacks } from './packs';
import { judgeReply, replyJudgeEnabled } from './reply-check';
import { replayDelayMs, replayEnabled, sleep } from './replay';
import { expandVariants } from './variants';

export interface GateOptions {
  /** Tests inject the AI SDK mock model; passed to runAgent (and the judge / paraphraser unless they're off). */
  modelOverride?: LanguageModel;
}

const DEFAULT_CONCURRENCY = 4;
export function gateConcurrency(): number {
  const n = Number(process.env.SHIPYARD_GATE_CONCURRENCY);
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 16) : DEFAULT_CONCURRENCY;
}

/** Live safety: the gate only ever runs scenarios on twins. */
export function assertTwinDb(db: SystemDb): void {
  if (!db || db.kind !== 'twin') throw new Error('gate refuses to run a scenario on a non-twin (live) database');
}

/** Tiny promise pool: runs fn over items with at most `limit` in flight. Never rejects (fn must catch). */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Spec + pack + generated scenarios, deduped by name (explicit spec scenarios win). */
export function mergeScenarios(spec: AgentSpec, scenarios: Scenario[]): Scenario[] {
  const seen = new Set<string>();
  const out: Scenario[] = [];
  const normalized = scenarios.map((s) => {
    const inferred = repo.inferScenarioSource(s.name);
    return { ...s, source: s.source ?? inferred.source, pack: s.pack ?? inferred.pack };
  });
  let packs: Scenario[] = [];
  try {
    packs = expandTestPacks(spec);
  } catch (err) {
    console.error('[gate] test packs failed to load', err);
  }
  for (const s of [...normalized, ...packs]) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    out.push(s);
  }
  return out;
}

interface AttemptResult {
  summary: ScenarioResultSummary;
  cost: number;
  criticalFailed: boolean;
}

async function safeUpsert(input: repo.ScenarioResultInput): Promise<void> {
  try {
    await repo.upsertScenarioResult(input);
  } catch (err) {
    console.error('[gate] upsertScenarioResult failed', input.scenario, err);
  }
}

async function runAttempt(
  ctx: { agent: string; version: number; spec: AgentSpec; opts: GateOptions },
  scenario: Scenario,
  attempt: number,
): Promise<AttemptResult> {
  const { agent, version, spec, opts } = ctx;
  const base = { agent, version, scenario: scenario.name, attempt, source: scenario.source, pack: scenario.pack ?? null };
  await safeUpsert({ ...base, status: 'running' });

  let twin: Awaited<ReturnType<typeof createTwin>> | null = null;
  let runId: string | null = null;
  let finalReply: string | null = null;
  let before: Snapshot | null = null;
  let after: Snapshot | null = null;
  let diff: TwinDiff | null = null;
  let outcomes: AssertionOutcome[] = [];
  let replyCheck: ReplyCheck | null = null;
  let cost = 0;
  let status: ScenarioStatus = 'error';
  try {
    twin = await createTwin();
    assertTwinDb(twin.db);
    await twin.seed(scenario.setup ?? {});
    before = await twin.snapshot();
    const r = await runAgent({
      spec,
      version,
      messages: scenario.conversation.map((t) => ({ role: 'user' as const, content: t.user })),
      db: twin.db,
      mode: 'scenario',
      scenario: scenario.name,
      modelOverride: opts.modelOverride,
    });
    runId = r.run_id;
    finalReply = r.final_reply;
    cost = Number(r.cost_usd) || 0;
    after = await twin.snapshot();
    diff = diffSnapshots(before, after);
    outcomes = await evaluateAssertions(twin.db, scenario.assert ?? [], finalReply ?? '');
    status = r.outcome === 'error' ? 'error' : outcomes.every((o) => o.passed) ? 'passed' : 'failed';
    if (replyJudgeEnabled()) {
      replyCheck = await judgeReply({ conversation: scenario.conversation, finalReply: finalReply ?? '' });
    }
  } catch (err) {
    console.error('[gate] scenario attempt failed', scenario.name, attempt, err);
    status = 'error';
    finalReply = finalReply ?? `Gate error: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    if (twin) await twin.close().catch(() => undefined);
  }

  await safeUpsert({
    ...base,
    status,
    run_id: runId,
    assertions: outcomes,
    reply_check: replyCheck,
    final_reply: finalReply,
    diff,
    before_snapshot: before,
    after_snapshot: after,
  });
  return {
    cost,
    // Errors count as failures; an errored attempt cannot prove the critical checks held.
    criticalFailed: status === 'error' || outcomes.some((o) => o.critical && !o.passed),
    summary: {
      scenario: scenario.name,
      attempt,
      status,
      run_id: runId,
      assertions: outcomes,
      reply_check: replyCheck,
      final_reply: finalReply,
      diff,
      source: scenario.source,
      ...(scenario.pack ? { pack: scenario.pack } : {}),
    },
  };
}

/** Pass rate, blocked rule (PRD 12) from per-attempt results grouped by scenario. */
export function decide(
  names: string[],
  attempts: AttemptResult[],
  minPassRate: number,
): { status: VersionStatus; pass_rate: number } {
  if (!names.length) return { status: 'live', pass_rate: 1 };
  let passed = 0;
  let criticalMajority = false;
  for (const name of names) {
    const mine = attempts.filter((a) => a.summary.scenario === name);
    const ok = mine.filter((a) => a.summary.status === 'passed').length;
    const crit = mine.filter((a) => a.criticalFailed).length;
    if (ok * 2 > mine.length) passed += 1;
    if (crit * 2 > mine.length) criticalMajority = true;
  }
  const pass_rate = passed / names.length;
  const blocked = pass_rate < minPassRate || criticalMajority;
  return { status: blocked ? 'blocked' : 'live', pass_rate };
}

async function collectEvents(runIds: (string | null)[]): Promise<RunEvent[]> {
  const ids = [...new Set(runIds.filter((x): x is string => Boolean(x)))];
  const lists = await pool(ids, 8, async (id) => {
    try {
      return await repo.listEvents(id);
    } catch {
      return [] as RunEvent[];
    }
  });
  return lists.flat();
}

async function finish(
  args: { agent: string; version: number; spec: AgentSpec; startedAt: string },
  scenarios: Scenario[],
  results: ScenarioResultSummary[],
  decision: { status: VersionStatus; pass_rate: number | null },
  totalCost: number,
  auditDetail: Record<string, unknown>,
): Promise<GateResult> {
  const { agent, version, spec, startedAt } = args;
  const coverage = computeCoverage(spec, scenarios, await collectEvents(results.map((r) => r.run_id)));
  const total_cost_usd = Math.round(totalCost * 1e6) / 1e6;
  await repo.finishVersion(agent, version, { status: decision.status, pass_rate: decision.pass_rate, total_cost_usd });
  let current: number | null = null;
  if (decision.status === 'live') {
    await repo.setCurrentVersion(agent, version);
    current = version;
  } else {
    current = (await repo.getAgent(agent).catch(() => null))?.current_version ?? null;
  }
  const failed = results.filter((r) => r.status !== 'passed').map((r) => r.scenario);
  await repo
    .audit('gate', decision.status, `${agent}@v${version}`, {
      pass_rate: decision.pass_rate,
      total_cost_usd,
      tests: scenarios.length,
      failed: [...new Set(failed)],
      ...auditDetail,
    })
    .catch((err) => console.error('[gate] audit failed', err));
  return {
    agent,
    version,
    status: decision.status,
    pass_rate: decision.pass_rate,
    total_cost_usd,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    current_version: current,
    scenario_names: scenarios.map((s) => s.name),
    results,
    coverage,
  };
}

/** Replays a cached version's results with staggered delays (SHIPYARD_DEMO_REPLAY=1). */
async function tryReplay(
  args: { agent: string; version: number; spec: AgentSpec; specHash: string; startedAt: string },
  scenarios: Scenario[],
): Promise<GateResult | null> {
  if (!replayEnabled() || !args.specHash) return null;
  const cached = await repo.findVersionByHash(args.agent, args.specHash).catch(() => null);
  if (!cached || cached.version === args.version) return null;
  const prior = await repo.listScenarioResults(args.agent, cached.version);
  if (!prior.length) return null;
  for (const r of prior) {
    await sleep(replayDelayMs());
    const snaps = r.run_id ? await repo.getScenarioResultByRun(r.run_id).catch(() => null) : null;
    await safeUpsert({
      agent: args.agent,
      version: args.version,
      scenario: r.scenario,
      attempt: r.attempt,
      status: r.status,
      run_id: r.run_id,
      assertions: r.assertions,
      reply_check: r.reply_check,
      final_reply: r.final_reply,
      diff: r.diff,
      before_snapshot: snaps?.before_snapshot ?? null,
      after_snapshot: snaps?.after_snapshot ?? null,
      source: r.source,
      pack: r.pack ?? null,
    });
  }
  const names = [...new Set(prior.map((r) => r.scenario))];
  const replayScenarios = names.map(
    (n) => scenarios.find((s) => s.name === n) ?? { name: n, description: '', setup: {}, conversation: [], assert: [], ...repo.inferScenarioSource(n) },
  );
  return finish(
    args,
    replayScenarios,
    prior,
    { status: cached.status, pass_rate: cached.pass_rate },
    cached.total_cost_usd ?? 0,
    { replayed_from: cached.version, spec_hash: args.specHash },
  );
}

export const runGate = async (
  args: Parameters<RunGateFn>[0],
  opts: GateOptions = {},
): Promise<GateResult> => {
  const { agent, version, spec, specHash } = args;
  const startedAt = new Date().toISOString();
  try {
    const merged = mergeScenarios(spec, args.scenarios ?? []);
    const replay = await tryReplay({ agent, version, spec, specHash, startedAt }, merged);
    if (replay) return replay;

    const scenarios = await expandVariants(merged, spec.gate?.variants ?? 0);
    const runs = Math.max(1, Math.floor(spec.gate?.runs_per_scenario ?? 1));
    const jobs = scenarios.flatMap((s) => Array.from({ length: runs }, (_, i) => ({ s, attempt: i + 1 })));
    const ctx = { agent, version, spec, opts };
    const attempts = await pool(jobs, gateConcurrency(), ({ s, attempt }) => runAttempt(ctx, s, attempt));

    const decision = decide(
      scenarios.map((s) => s.name),
      attempts,
      spec.gate?.min_pass_rate ?? 1,
    );
    const totalCost = attempts.reduce((n, a) => n + a.cost, 0);
    return await finish(
      { agent, version, spec, startedAt },
      scenarios,
      attempts.map((a) => a.summary),
      decision,
      totalCost,
      { spec_hash: specHash },
    );
  } catch (err) {
    console.error('[gate] fatal', err);
    await repo
      .finishVersion(agent, version, { status: 'error', pass_rate: null, total_cost_usd: null })
      .catch(() => undefined);
    await repo.audit('gate', 'error', `${agent}@v${version}`, { error: String(err) }).catch(() => undefined);
    return {
      agent,
      version,
      status: 'error',
      pass_rate: null,
      total_cost_usd: null,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      current_version: null,
      scenario_names: [],
      results: [],
      coverage: null,
    };
  }
};

// Type check: runGate satisfies the cross-lane contract.
const _contract: RunGateFn = runGate;
void _contract;
