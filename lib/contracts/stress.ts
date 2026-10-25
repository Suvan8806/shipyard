// CONTRACT: stress testing (reliability reruns, red-team swarm, model matrix) + version diff.
// Shared by Lane STRESS (backend), the dashboard lane and the CLI lane. Change only by agreement.
//
//   POST /api/agents/:name/stress            body StressRequest -> StressStarted (202; 402 budget_exceeded, 429 rate_limited)
//   GET  /api/agents/:name/stress            -> StressSummary[] (newest first)
//   GET  /api/agents/:name/stress/:id        -> StressResult
//   GET  /api/agents/:name/diff?from=3&to=4  -> VersionDiff
//
// Stress runs are DRY RUNS: they never change agents.current_version and never show up in the version history.

export type StressMode = 'reliability' | 'redteam' | 'matrix';
export type StressStatus = 'running' | 'done' | 'error';

export interface StressRequest {
  mode: StressMode;
  /** reliability: how many times every test is re-run (2-5, default 3). */
  runs?: number;
  /** redteam: how many adversarial scenarios to generate and run (10-60, default 30). */
  count?: number;
  /** matrix: 2-4 model strings (e.g. "google/gemini-3.5-flash"); default careful + fast + first groq fallback. */
  models?: string[];
  /** reliability only: which model profile the reruns use (default 'fast', the cheap one). */
  profile?: 'fast' | 'careful';
}

export interface StressStarted {
  stress_id: string;
  status: 'running';
  /** Pre-flight estimate the budget guard checked (tests x runs x ~$0.006). */
  estimated_cost_usd?: number;
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
  /** Attempts that passed. */
  passes: number;
  /** Attempts that finished (passed, failed or errored). */
  runs: number;
  /** 0 < passes < runs: the same test both passed and failed. */
  flaky: boolean;
  run_ids: string[];
}

export interface ReliabilityReport {
  runs: number;
  /** 0-100, total passed attempts / total finished attempts; null until something finished. */
  reliability_pct: number | null;
  scenarios: ReliabilityScenario[];
}

export interface RedteamAttack {
  scenario: string;
  description: string;
  status: 'running' | 'passed' | 'failed' | 'error';
  run_id: string | null;
  failed_assertions: string[];
}

export interface RedteamReport {
  generated: number;
  /** Attacks whose end-state checks failed: the agent did the wrong thing. */
  broke_through: number;
  attacks: RedteamAttack[];
}

export interface MatrixModel {
  model: string;
  /** Agent version whose spec was tested (null: the unsaved draft). */
  version: number | null;
  /** 'running', or the gate verdict this model would get: 'live' | 'blocked'. */
  status: string;
  /** 0-1 share of tests passed; null until something finished. */
  pass_rate: number | null;
  cost_usd: number | null;
  avg_latency_ms: number | null;
  failed: string[];
}

export interface MatrixReport {
  models: MatrixModel[];
}

export interface StressResult {
  stress_id: string;
  agent: string;
  mode: StressMode;
  status: StressStatus;
  created_at: string;
  finished_at: string | null;
  total_cost_usd: number | null;
  /** e.g. "Reliability 97.8% · 2 flaky tests" / "Red team: 41 attacks, 3 broke through" / "gemini-3.5-flash wins: 100% at $0.28" */
  headline: string;
  reliability?: ReliabilityReport;
  redteam?: RedteamReport;
  matrix?: MatrixReport;
}

export type DiffKind = 'add' | 'del' | 'same';
export type ScenarioChange = 'newly_failing' | 'fixed' | 'still_failing' | 'still_passing' | 'added' | 'removed';

export interface VersionDiff {
  from: number;
  to: number;
  /** line = 1-based line number in the `to` spec for add/same, in the `from` spec for del. */
  spec_diff: { line: number; kind: DiffKind; text: string }[];
  scenarios: { scenario: string; from_status: string | null; to_status: string | null; change: ScenarioChange }[];
}

// ---------- limits + cost model ----------
export const STRESS_LIMITS = {
  runs: { min: 2, max: 5, default: 3 },
  count: { min: 10, max: 60, default: 30 },
  models: { min: 2, max: 4 },
} as const;

/** Rough model cost of one test attempt (46 tests ~ $0.28 per deploy). */
export const COST_PER_TEST_USD = 0.006;
/** Rough cost of one red-team generation batch (careful model, structured output). */
export const COST_PER_GENERATION_BATCH_USD = 0.01;
/** Red-team scenarios are generated in parallel batches of at most this many. */
export const REDTEAM_BATCH_SIZE = 15;
