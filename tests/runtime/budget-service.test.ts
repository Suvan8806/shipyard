// Service entry points answer HTTP 402 'budget_exceeded' once spend reaches the cap (repo mocked).
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/platform/repo', () => ({ totalSpendUsd: async () => 12.345 }));

import { resetSpendCache } from '../../lib/runtime/budget';
import { budgetStatus, requireBudget } from '../../lib/services/budget';
import { errorResponse } from '../../app/api/_lib/http';

afterEach(() => resetSpendCache());

describe('requireBudget', () => {
  it('throws a 402 budget_exceeded ServiceError over budget', async () => {
    const err = await requireBudget().catch((e) => e);
    expect(err).toMatchObject({ name: 'ServiceError', code: 'budget_exceeded', status: 402 });
    expect(err.message).toMatch(/Budget reached \(\$12\.35 of \$8\.00\)/);
  });

  it('maps to an HTTP 402 envelope', async () => {
    const res = errorResponse(await requireBudget().catch((e) => e));
    expect(res.status).toBe(402);
    expect((await res.json()).error.code).toBe('budget_exceeded');
  });

  it('reports spend and budget for /api/health', async () => {
    expect(await budgetStatus()).toEqual({ spend_usd: 12.345, budget_usd: 8 });
  });
});
