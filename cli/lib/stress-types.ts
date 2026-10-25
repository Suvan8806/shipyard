// CLI-side helpers for the SHARED STRESS CONTRACT. Types come from lib/contracts/stress.ts (single source of truth).
import { COST_PER_TEST_USD, type StressRequest } from '../../lib/contracts/stress';

/** Contract cost heuristic: tests x runs x ~$0.006 per scenario run. */
export function estimateStressCost(req: StressRequest, tests: number): { runs: number; usd: number } {
  let runs: number;
  if (req.mode === 'reliability') runs = tests * clamp(req.runs ?? 3, 2, 5);
  else if (req.mode === 'redteam') runs = clamp(req.count ?? 30, 10, 60);
  else runs = tests * clamp(req.models?.length ?? 3, 2, 4);
  return { runs, usd: Math.round(runs * COST_PER_TEST_USD * 100) / 100 };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
