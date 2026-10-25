// Builds a StressResult from the header metadata + the stress run's scenario_results rows + their runs' stats.
import type { MatrixModel, StressResult } from '../contracts/stress';
import type { ScenarioResultSummary } from '../types';
import { attemptFromSummary } from '../gate/attempt';
import { decide } from '../gate/verdict';
import { asMeta, toStressId, type StressMeta } from './meta';
import {
  matrixHeadline,
  redteamAttacks,
  redteamHeadline,
  reliabilityHeadline,
  reliabilityOf,
} from './math';

export type RunStats = Map<string, { cost_usd: number; duration_ms: number | null }>;

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function costOf(rows: ScenarioResultSummary[], stats: RunStats): number {
  return round6(rows.reduce((n, r) => n + (r.run_id ? (stats.get(r.run_id)?.cost_usd ?? 0) : 0), 0));
}

function matrixModels(meta: StressMeta, rows: ScenarioResultSummary[], stats: RunStats): MatrixModel[] {
  const names = meta.scenario_names;
  return (meta.models ?? []).map((model, i) => {
    const mine = rows.filter((r) => r.attempt === i + 1);
    const done = mine.filter((r) => r.status !== 'running');
    const running = done.length < Math.max(mine.length, names.length) && meta.status === 'running';
    const passed = done.filter((r) => r.status === 'passed').length;
    const durations = done
      .map((r) => (r.run_id ? stats.get(r.run_id)?.duration_ms : null))
      .filter((x): x is number => typeof x === 'number');
    const verdict = done.length ? decide(names, done.map((r) => attemptFromSummary(r)), meta.spec.gate?.min_pass_rate ?? 1) : null;
    return {
      model,
      version: meta.source_version,
      status: running ? 'running' : (verdict?.status ?? 'error'),
      pass_rate: done.length ? Math.round((passed / done.length) * 1000) / 1000 : null,
      cost_usd: done.length ? costOf(done, stats) : null,
      avg_latency_ms: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      failed: done.filter((r) => r.status !== 'passed').map((r) => r.scenario),
    };
  });
}

/** Expected attempts for the suite (used for progress and to know when everything is terminal). */
export function expectedAttempts(meta: StressMeta): number {
  const n = meta.scenario_names.length;
  if (meta.mode === 'reliability') return n * (meta.runs ?? 1);
  if (meta.mode === 'matrix') return n * (meta.models?.length ?? 1);
  return n;
}

export function buildResult(
  agent: string,
  header: { version: number; created_at: string; meta: Record<string, unknown> },
  rows: ScenarioResultSummary[],
  stats: RunStats,
): StressResult {
  const meta = asMeta(header.meta);
  if (!meta) throw new Error('stress header has no metadata');
  const running = meta.status === 'running';
  const base: StressResult = {
    stress_id: toStressId(header.version),
    agent,
    mode: meta.mode,
    status: meta.status,
    created_at: meta.created_at ?? header.created_at,
    finished_at: meta.finished_at ?? null,
    total_cost_usd: rows.length ? costOf(rows, stats) : (meta.total_cost_usd ?? null),
    headline: meta.headline,
  };
  if (meta.mode === 'reliability') {
    const reliability = reliabilityOf(rows, meta.runs ?? 1, meta.scenario_names);
    const headline = meta.status === 'error' ? meta.headline : reliabilityHeadline(reliability, running, expectedAttempts(meta));
    return { ...base, headline, reliability };
  }
  if (meta.mode === 'redteam') {
    const attacks = redteamAttacks(meta.attacks ?? [], rows);
    const phase = !running ? 'done' : meta.phase === 'generating' ? 'generating' : 'testing';
    const headline = meta.status === 'error' ? meta.headline : redteamHeadline(attacks, phase);
    return {
      ...base,
      headline,
      redteam: { generated: attacks.length, broke_through: attacks.filter((a) => a.status === 'failed').length, attacks },
    };
  }
  const models = matrixModels(meta, rows, stats);
  const headline = meta.status === 'error' ? meta.headline : matrixHeadline(models, running);
  return { ...base, headline, matrix: { models } };
}
