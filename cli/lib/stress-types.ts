// Local mirror of the SHARED STRESS CONTRACT (lib/contracts/stress.ts on the dev-stress branch).
// Replace with `import type { ... } from '../../lib/contracts/stress'` once that lane merges; the shapes are identical.

export type StressMode = 'reliability' | 'redteam' | 'matrix';

export interface StressRequest {
  mode: StressMode;
  /** reliability: 2-5, default 3 */
  runs?: number;
  /** redteam: 10-60, default 30 */
  count?: number;
  /** matrix: 2-4 model strings */
  models?: string[];
}

export interface StressStartResponse {
  stress_id: string;
  status: 'running';
}

export interface StressSummary {
  stress_id: string;
  mode: StressMode;
  status: 'running' | 'done' | 'error';
  created_at: string;
  headline: string;
}

export interface StressReliabilityScenario {
  scenario: string;
  source: string;
  pack?: string;
  passes: number;
  runs: number;
  flaky: boolean;
  run_ids: string[];
}

export interface StressAttack {
  scenario: string;
  description: string;
  status: 'running' | 'passed' | 'failed' | 'error';
  run_id: string | null;
  failed_assertions: string[];
}

export interface StressMatrixModel {
  model: string;
  version: number | null;
  status: string;
  pass_rate: number | null;
  cost_usd: number | null;
  avg_latency_ms: number | null;
  failed: string[];
}

export interface StressResult {
  stress_id: string;
  agent: string;
  mode: StressMode;
  status: 'running' | 'done' | 'error';
  created_at: string;
  finished_at: string | null;
  total_cost_usd: number | null;
  headline: string;
  reliability?: { runs: number; reliability_pct: number | null; scenarios: StressReliabilityScenario[] };
  redteam?: { generated: number; broke_through: number; attacks: StressAttack[] };
  matrix?: { models: StressMatrixModel[] };
}

export interface SpecDiffLine {
  line: number;
  kind: 'add' | 'del' | 'same';
  text: string;
}

export type ScenarioChange = 'newly_failing' | 'fixed' | 'still_failing' | 'still_passing' | 'added' | 'removed';

export interface VersionDiff {
  from: number;
  to: number;
  spec_diff: SpecDiffLine[];
  scenarios: { scenario: string; from_status: string | null; to_status: string | null; change: ScenarioChange }[];
}

/** Contract cost heuristic: tests x runs x ~$0.006 per scenario run. */
export const COST_PER_TEST_RUN_USD = 0.006;

export function estimateStressCost(req: StressRequest, tests: number): { runs: number; usd: number } {
  let runs: number;
  if (req.mode === 'reliability') runs = tests * clamp(req.runs ?? 3, 2, 5);
  else if (req.mode === 'redteam') runs = clamp(req.count ?? 30, 10, 60);
  else runs = tests * clamp(req.models?.length ?? 3, 2, 4);
  return { runs, usd: Math.round(runs * COST_PER_TEST_RUN_USD * 100) / 100 };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
