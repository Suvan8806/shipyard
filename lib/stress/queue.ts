// Stress fan-out: the same queue as the deploy gate (one serverless invocation per attempt, scenario_results rows
// as the queue), but keyed by the stress run's negative version and dispatched to the stress worker route. It never
// calls applyVerdict/finishVersion, so a stress run can't change agent_versions or current_version.
import * as repo from '../platform/repo';
import { runAttempt } from '../gate/attempt';
import { gateConcurrency } from '../gate/gate';
import { ATTEMPT_STALE_SECS, INTERNAL_HEADER, VERSION_STALE_SECS, internalSecret, type DispatchCtx } from '../gate/queue';
import type { Scenario } from '../types';
import { asMeta, attemptModel, attemptSpec, toStressId, workerPath, type StressMeta } from './meta';
import { buildResult, expectedAttempts } from './result';

/** A stress run older than this is force-finished: unfinished attempts become errors. */
export const STRESS_STALE_SECS = 45 * 60;
/** A red-team run still generating after this long is marked as errored. */
const GENERATING_STALE_SECS = 10 * 60;
const INLINE_MIN_REMAINING_MS = 90_000;
const DISPATCH_TIMEOUT_MS = 15_000;

async function dispatch(agent: string, version: number, job: repo.QueuedAttempt, ctx: DispatchCtx): Promise<boolean> {
  if (!ctx.baseUrl) return false;
  try {
    const res = await fetch(`${ctx.baseUrl}${workerPath(agent, toStressId(version))}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [INTERNAL_HEADER]: internalSecret(),
        ...(ctx.bypass ? { 'x-vercel-protection-bypass': ctx.bypass } : {}),
      },
      body: JSON.stringify({ scenario: job.scenario, attempt: job.attempt }),
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    });
    if (res.status === 202) return true;
    console.error(`[stress] dispatch ${job.scenario}#${job.attempt} got HTTP ${res.status}`);
    return false;
  } catch (e) {
    console.error(`[stress] dispatch ${job.scenario}#${job.attempt} failed:`, e instanceof Error ? e.message : e);
    return false;
  }
}

/** Queues one row per (scenario, attempt). */
export async function enqueueStress(agent: string, version: number, jobs: { s: Scenario; attempt: number }[]): Promise<void> {
  await repo.insertQueuedScenarioResults(agent, version, jobs.map(({ s, attempt }) => ({ scenario: s, attempt })));
}

/** Fills free slots (bounded by SHIPYARD_GATE_CONCURRENCY per stress run); failed dispatches run inline or requeue. */
export async function pumpStress(agent: string, version: number, ctx: DispatchCtx): Promise<void> {
  let claimed: repo.QueuedAttempt[];
  try {
    claimed = await repo.claimQueuedScenarios(agent, version, gateConcurrency());
  } catch (e) {
    console.error('[stress] claim failed', e);
    return;
  }
  await Promise.all(
    claimed.map(async (job) => {
      if (await dispatch(agent, version, job, ctx)) return;
      if (ctx.deadline - Date.now() > INLINE_MIN_REMAINING_MS) {
        await runStressClaimed(agent, version, job.scenario, job.attempt, ctx);
      } else {
        await repo.unclaimScenario(agent, version, job.scenario, job.attempt).catch(() => undefined);
      }
    }),
  );
}

async function metaOf(agent: string, version: number): Promise<StressMeta | null> {
  const h = await repo.getStressHeader(agent, version);
  return h ? asMeta(h.meta) : null;
}

/** Worker body: run one claimed attempt with the stress run's model settings, keep the pipeline full, finalize. */
export async function runStressClaimed(agent: string, version: number, scenario: string, attempt: number, ctx: DispatchCtx): Promise<void> {
  const payload = await repo.getStartedScenario(agent, version, scenario, attempt);
  if (!payload) return;
  const meta = await metaOf(agent, version);
  if (!meta || meta.status !== 'running') return;
  await runAttempt(
    { agent, version, spec: attemptSpec(meta), opts: { runVersion: null, modelId: attemptModel(meta, attempt) } },
    payload as unknown as Scenario,
    attempt,
    { markRunning: false },
  );
  await pumpStress(agent, version, ctx);
  await finalizeStress(agent, version).catch((e) => console.error('[stress] finalize failed', e));
}

/** Rows of the stress run without the header. */
export async function stressRows(agent: string, version: number) {
  return (await repo.listScenarioResults(agent, version)).filter((r) => r.scenario !== repo.STRESS_SCENARIO);
}

/** When every attempt is terminal, stamps the header done (first caller wins). Returns true if it finalized. */
export async function finalizeStress(agent: string, version: number): Promise<boolean> {
  const header = await repo.getStressHeader(agent, version);
  const meta = header ? asMeta(header.meta) : null;
  if (!header || !meta || meta.status !== 'running' || meta.phase !== 'testing') return false;
  const rows = await stressRows(agent, version);
  if (rows.some((r) => r.status === 'running') || rows.length < expectedAttempts(meta)) return false;
  const stats = await repo.runStats(rows.map((r) => r.run_id).filter((x): x is string => Boolean(x)));
  const done = buildResult(agent, { ...header, meta: { ...header.meta, status: 'done' } }, rows, stats);
  const applied = await repo.updateStressMeta(
    agent,
    version,
    { status: 'done', finished_at: new Date().toISOString(), total_cost_usd: done.total_cost_usd, headline: done.headline },
    { onlyIfRunning: true },
  );
  if (applied) {
    await repo
      .audit('stress', `stress.${meta.mode}.done`, agent, { stress_id: toStressId(version), headline: done.headline, total_cost_usd: done.total_cost_usd })
      .catch(() => undefined);
  }
  return applied;
}

export async function failStress(agent: string, version: number, message: string): Promise<void> {
  await repo
    .updateStressMeta(
      agent,
      version,
      { status: 'error', error: message.slice(0, 500), headline: `Stress test failed: ${message.slice(0, 160)}`, finished_at: new Date().toISOString() },
      { onlyIfRunning: true },
    )
    .catch((e) => console.error('[stress] could not record failure', e));
}

/** Reconcile on read: sweep stale work, finalize when terminal, report whether the queue needs a pump. */
export async function reconcileStress(agent: string, version: number): Promise<{ needsPump: boolean }> {
  const header = await repo.getStressHeader(agent, version);
  const meta = header ? asMeta(header.meta) : null;
  if (!header || !meta || meta.status !== 'running') return { needsPump: false };
  const ageSecs = (Date.now() - Date.parse(header.created_at)) / 1000;
  if (meta.phase === 'generating') {
    if (ageSecs > GENERATING_STALE_SECS) await failStress(agent, version, 'attack generation did not finish');
    return { needsPump: false };
  }
  await repo.sweepStaleScenarioResults(agent, version, ATTEMPT_STALE_SECS, VERSION_STALE_SECS);
  await repo.sweepStaleStress(agent, version, STRESS_STALE_SECS);
  const counts = await repo.scenarioQueueCounts(agent, version);
  if (counts.queued === 0 && counts.inflight === 0) {
    if (!(await finalizeStress(agent, version)) && ageSecs > STRESS_STALE_SECS) {
      await failStress(agent, version, 'stress run never completed');
    }
    return { needsPump: false };
  }
  return { needsPump: counts.queued > 0 && counts.inflight < gateConcurrency() };
}

/** Polls + re-pumps until the stress run is terminal or the timeout passes (run from after()). */
export async function superviseStress(agent: string, version: number, ctx: DispatchCtx, timeoutMs = 250_000, intervalMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() + intervalMs < deadline) {
    const { needsPump } = await reconcileStress(agent, version);
    if (needsPump) await pumpStress(agent, version, ctx);
    const meta = await metaOf(agent, version);
    if (!meta || meta.status !== 'running') return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
