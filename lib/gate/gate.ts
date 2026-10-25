// The gate (PRD 12): every scenario attempt on its own throwaway twin, end state checked with structured
// assertions, majority vote, then live or blocked. Results stream into scenario_results as they finish.
import * as repo from '../platform/repo';
import type { AgentSpec, GateResult, RunEvent, RunGateFn, Scenario, ScenarioResultSummary, VersionStatus } from '../types';
import { runAttempt, type GateOptions } from './attempt';
import { computeCoverage } from './coverage';
import { expandTestPacks } from './packs';
import { replayDelayMs, replayEnabled, sleep } from './replay';
import { expandVariants } from './variants';
import { applyVerdict, decide } from './verdict';

export { assertTwinDb, type GateOptions } from './attempt';
export { decide } from './verdict';

const DEFAULT_CONCURRENCY = 3;
export function gateConcurrency(): number {
  const n = Number(process.env.SHIPYARD_GATE_CONCURRENCY);
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 16) : DEFAULT_CONCURRENCY;
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

/** Merged scenarios + paraphrase variants, and one job per (scenario, attempt). Shared with the fan-out queue. */
export async function planJobs(
  spec: AgentSpec,
  merged: Scenario[],
): Promise<{ scenarios: Scenario[]; jobs: { s: Scenario; attempt: number }[] }> {
  const scenarios = await expandVariants(merged, spec.gate?.variants ?? 0);
  const runs = Math.max(1, Math.floor(spec.gate?.runs_per_scenario ?? 1));
  const jobs = scenarios.flatMap((s) => Array.from({ length: runs }, (_, i) => ({ s, attempt: i + 1 })));
  return { scenarios, jobs };
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
  const failed = results.filter((r) => r.status !== 'passed').map((r) => r.scenario);
  const applied = await applyVerdict(agent, version, decision, totalCost, {
    tests: scenarios.length,
    failed: [...new Set(failed)],
    ...auditDetail,
  });
  const total_cost_usd = applied.total_cost_usd;
  const current = applied.current_version;
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
export async function tryReplay(
  args: { agent: string; version: number; spec: AgentSpec; specHash: string; startedAt: string },
  scenarios: Scenario[],
): Promise<GateResult | null> {
  if (!replayEnabled() || !args.specHash) return null;
  const cached = await repo.findVersionByHash(args.agent, args.specHash).catch(() => null);
  if (!cached || cached.version === args.version) return null;
  const prior = await repo.listScenarioResults(args.agent, cached.version);
  if (!prior.length) return null;
  // Placeholder 'running' rows (marker "replay", so the queue never claims them) keep the fan-out reconcile, run on
  // every dashboard poll, from finalizing the version after only the first few staggered copies have landed.
  for (const r of prior) {
    await repo
      .upsertScenarioResult({
        agent: args.agent,
        version: args.version,
        scenario: r.scenario,
        attempt: r.attempt,
        status: 'running',
        before_snapshot: { __gate: 'replay' } as never,
        source: r.source,
        pack: r.pack ?? null,
      })
      .catch((err) => console.error('[gate] replay placeholder failed', r.scenario, err));
  }
  for (const r of prior) {
    await sleep(replayDelayMs());
    const snaps = r.run_id ? await repo.getScenarioResultByRun(r.run_id).catch(() => null) : null;
    await repo.upsertScenarioResult({
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
    }).catch((err) => console.error('[gate] replay upsert failed', r.scenario, err));
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

    const { scenarios, jobs } = await planJobs(spec, merged);
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
      .finishVersionIfRunning(agent, version, { status: 'error', pass_rate: null, total_cost_usd: null })
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
