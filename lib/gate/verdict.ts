// Verdict (PRD 12): majority vote per scenario, pass rate vs min_pass_rate, critical-majority rule. Shared by the
// in-process gate and the fan-out finalize step. Finishing a version is idempotent (conditional UPDATE).
import * as repo from '../platform/repo';
import type { VersionStatus } from '../types';
import { attemptFromSummary, type AttemptResult } from './attempt';

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

export interface AppliedVerdict {
  status: VersionStatus;
  pass_rate: number | null;
  total_cost_usd: number;
  /** True when this call moved the version out of 'running' (false: someone else already finished it). */
  applied: boolean;
  current_version: number | null;
}

/** Finishes the version (only if still running), points current_version at it when live, writes the audit row. */
export async function applyVerdict(
  agent: string,
  version: number,
  decision: { status: VersionStatus; pass_rate: number | null },
  totalCost: number,
  auditDetail: Record<string, unknown>,
): Promise<AppliedVerdict> {
  const total_cost_usd = Math.round(totalCost * 1e6) / 1e6;
  const applied = await repo.finishVersionIfRunning(agent, version, {
    status: decision.status,
    pass_rate: decision.pass_rate,
    total_cost_usd,
  });
  let current: number | null;
  if (applied && decision.status === 'live') {
    await repo.setCurrentVersion(agent, version);
    current = version;
  } else {
    current = (await repo.getAgent(agent).catch(() => null))?.current_version ?? null;
  }
  if (applied) {
    await repo
      .audit('gate', decision.status, `${agent}@v${version}`, { pass_rate: decision.pass_rate, total_cost_usd, ...auditDetail })
      .catch((err) => console.error('[gate] audit failed', err));
  }
  return { ...decision, total_cost_usd, applied, current_version: current };
}

/**
 * Fan-out finalize: when every scenario_results row of the version is terminal, compute the verdict exactly as
 * runGate does and finish the version. Returns null while attempts are still queued/running. Safe to call any
 * number of times from any invocation: only the first caller to flip the version applies it.
 */
export async function finalizeVersion(args: {
  agent: string;
  version: number;
  minPassRate: number;
  /** Scenario names expected even if they have no row (legacy runs killed before starting them count as failed). */
  expectedNames?: string[];
  auditDetail?: Record<string, unknown>;
}): Promise<AppliedVerdict | null> {
  const { agent, version } = args;
  const rows = await repo.listScenarioResults(agent, version);
  if (rows.some((r) => r.status === 'running')) return null;
  const names = [...new Set([...rows.map((r) => r.scenario), ...(args.expectedNames ?? [])])];
  const attempts = rows.map((r) => attemptFromSummary(r));
  const decision = decide(names, attempts, args.minPassRate);
  const cost = await repo.sumRunCosts(rows.map((r) => r.run_id).filter((x): x is string => Boolean(x))).catch(() => 0);
  const failed = [...new Set(rows.filter((r) => r.status !== 'passed').map((r) => r.scenario))];
  const errored = rows.filter((r) => r.status === 'error').length;
  return applyVerdict(agent, version, decision, cost, {
    tests: names.length,
    failed,
    errored,
    ...(args.auditDetail ?? {}),
  });
}
