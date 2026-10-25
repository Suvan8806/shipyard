// Local mirror of the SHARED STRESS CONTRACT (lib/contracts/stress.ts, written by the stress lane).
// Once that file lands on this branch, replace the body of this module with:
//   export type * from '@/lib/contracts/stress';
// Shapes below match the contract exactly; do not add fields here.

export type StressMode = 'reliability' | 'redteam' | 'matrix';
export type StressStatus = 'running' | 'done' | 'error';

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
  status: StressStatus;
  created_at: string;
  headline: string;
}

export interface ReliabilityScenario {
  scenario: string;
  source: string;
  pack?: string;
  passes: number;
  runs: number;
  flaky: boolean;
  run_ids: string[];
}

export interface RedteamAttack {
  scenario: string;
  description: string;
  status: 'running' | 'passed' | 'failed' | 'error';
  run_id: string | null;
  failed_assertions: string[];
}

export interface MatrixModel {
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
  status: StressStatus;
  created_at: string;
  finished_at: string | null;
  total_cost_usd: number | null;
  headline: string;
  reliability?: { runs: number; reliability_pct: number | null; scenarios: ReliabilityScenario[] };
  redteam?: { generated: number; broke_through: number; attacks: RedteamAttack[] };
  matrix?: { models: MatrixModel[] };
}

export type ScenarioChange = 'newly_failing' | 'fixed' | 'still_failing' | 'still_passing' | 'added' | 'removed';

export interface VersionDiff {
  from: number;
  to: number;
  spec_diff: { line: number; kind: 'add' | 'del' | 'same'; text: string }[];
  scenarios: { scenario: string; from_status: string | null; to_status: string | null; change: ScenarioChange }[];
}
