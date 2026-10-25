// Client-side cost preview for stress runs. The server re-estimates and refuses (402) if the budget can't cover it;
// this only powers the "This will spend about $X of the $Y budget left" confirm step.
import type { StressMode } from './contract';

/** Contract rule of thumb: ~$0.006 per test run. */
export const COST_PER_TEST_USD = 0.006;
/** Used when the agent has no gate yet to count tests from. */
export const DEFAULT_TEST_COUNT = 46;

export const RELIABILITY_RUNS = { min: 2, max: 5, default: 3 } as const;
export const REDTEAM_COUNT = { min: 10, max: 60, default: 30 } as const;
export const MATRIX_MODELS = { min: 2, max: 4 } as const;

/** Fallback chain models (lib/runtime/model.ts DEFAULT_FALLBACK_MODELS), offered next to the library profiles. */
export const FALLBACK_MODELS = ['google/gemini-3.5-flash', 'groq/openai/gpt-oss-20b', 'google/gemini-3.5-flash-lite'];

export interface EstimateInput {
  mode: StressMode;
  tests: number;
  runs?: number;
  count?: number;
  models?: number;
}

/** Number of individual test runs the stress job will execute. */
export function plannedRuns({ mode, tests, runs, count, models }: EstimateInput): number {
  if (mode === 'reliability') return tests * (runs ?? RELIABILITY_RUNS.default);
  if (mode === 'redteam') return count ?? REDTEAM_COUNT.default;
  return tests * (models ?? MATRIX_MODELS.min);
}

export function estimateCost(input: EstimateInput): number {
  return plannedRuns(input) * COST_PER_TEST_USD;
}

/** Remaining budget in USD, or null when the server doesn't report spend. */
export function budgetLeft(b: { spend_usd: number | null; budget_usd: number } | null): number | null {
  if (!b || b.spend_usd === null) return null;
  return Math.max(0, b.budget_usd - b.spend_usd);
}

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

/** Short display name for a model id: "google/gemini-3.5-flash" -> "gemini-3.5-flash". */
export function shortModel(id: string): string {
  const parts = id.split('/');
  return parts[parts.length - 1] || id;
}
