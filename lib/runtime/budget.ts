// Spend cap: SHIPYARD_BUDGET_USD (default $8) against the sum of runs.cost_usd. Checked before every model-call
// batch (agent run, judge, scenario generation, paraphrase). The sum is cached for 30 s per process.
export const DEFAULT_BUDGET_USD = 8;
export const SPEND_CACHE_MS = 30_000;

export interface SpendSource {
  totalSpendUsd(): Promise<number>;
}

export class BudgetExceededError extends Error {
  readonly spendUsd: number;
  readonly budgetUsd: number;
  constructor(spendUsd: number, budgetUsd: number) {
    super(budgetMessage(spendUsd, budgetUsd));
    this.name = 'BudgetExceededError';
    this.spendUsd = spendUsd;
    this.budgetUsd = budgetUsd;
  }
}

export function isBudgetExceeded(e: unknown): e is BudgetExceededError {
  return e instanceof BudgetExceededError || (typeof e === 'object' && e !== null && (e as { name?: string }).name === 'BudgetExceededError');
}

const usd = (n: number) => `$${n.toFixed(2)}`;

export function budgetMessage(spendUsd: number, budgetUsd: number): string {
  return `Budget reached (${usd(spendUsd)} of ${usd(budgetUsd)}). Raise SHIPYARD_BUDGET_USD to continue.`;
}

export function budgetUsd(): number {
  const n = Number(process.env.SHIPYARD_BUDGET_USD);
  return process.env.SHIPYARD_BUDGET_USD !== undefined && process.env.SHIPYARD_BUDGET_USD !== '' && Number.isFinite(n) && n >= 0
    ? n
    : DEFAULT_BUDGET_USD;
}

let cache: { at: number; value: number } | null = null;

/** Test helper: drop the cached spend. */
export function resetSpendCache(): void {
  cache = null;
}

async function defaultSource(): Promise<SpendSource> {
  const repo = await import('../platform/repo');
  return { totalSpendUsd: repo.totalSpendUsd };
}

/** Total platform spend (cached 30 s). */
export async function currentSpendUsd(source?: SpendSource, now = Date.now()): Promise<number> {
  if (cache && now - cache.at < SPEND_CACHE_MS) return cache.value;
  const value = await (source ?? (await defaultSource())).totalSpendUsd();
  cache = { at: now, value };
  return value;
}

/**
 * Throws BudgetExceededError when spend >= budget. If the spend can't be read (DB down), it logs and lets the
 * call through: the cap is a guard rail, not a reason to break the product.
 */
export async function assertBudget(source?: SpendSource): Promise<void> {
  const budget = budgetUsd();
  let spend: number;
  try {
    spend = await currentSpendUsd(source);
  } catch (e) {
    console.error('[budget] could not read total spend:', e instanceof Error ? e.message : e);
    return;
  }
  if (spend >= budget) throw new BudgetExceededError(spend, budget);
}
