// Service-level spend cap: entry points that start model calls (deploy, chat, generate, simulate) refuse with
// HTTP 402 'budget_exceeded' once total spend reaches SHIPYARD_BUDGET_USD.
import { assertBudget, budgetUsd, currentSpendUsd, isBudgetExceeded } from '../runtime/budget';
import { ServiceError } from './errors';

export async function requireBudget(): Promise<void> {
  try {
    await assertBudget();
  } catch (e) {
    if (isBudgetExceeded(e)) {
      throw new ServiceError('budget_exceeded', e.message, { spend_usd: e.spendUsd, budget_usd: e.budgetUsd });
    }
    throw e;
  }
}

/** For GET /api/health. spend_usd is null when the database can't be read. */
export async function budgetStatus(): Promise<{ spend_usd: number | null; budget_usd: number }> {
  const budget_usd = budgetUsd();
  try {
    return { spend_usd: Math.round((await currentSpendUsd()) * 1e6) / 1e6, budget_usd };
  } catch {
    return { spend_usd: null, budget_usd };
  }
}
