// Spend cap (SHIPYARD_BUDGET_USD): the check, the 30 s cache, and the runner ending a run with a clear reply.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import {
  BudgetExceededError,
  DEFAULT_BUDGET_USD,
  SPEND_CACHE_MS,
  assertBudget,
  budgetUsd,
  currentSpendUsd,
  resetSpendCache,
} from '../../lib/runtime/budget';
import { createRunner } from '../../lib/runtime/runner';
import type { AgentSpec } from '../../lib/types';
import { memoryRepo, pgliteDb, type TestDb } from './helpers';

const source = (value: number) => {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    totalSpendUsd: async () => {
      calls++;
      return value;
    },
  };
};

afterEach(() => {
  resetSpendCache();
  delete process.env.SHIPYARD_BUDGET_USD;
});

describe('budget', () => {
  it('defaults to $8 and reads SHIPYARD_BUDGET_USD', () => {
    expect(budgetUsd()).toBe(DEFAULT_BUDGET_USD);
    process.env.SHIPYARD_BUDGET_USD = '2.5';
    expect(budgetUsd()).toBe(2.5);
    process.env.SHIPYARD_BUDGET_USD = 'nope';
    expect(budgetUsd()).toBe(DEFAULT_BUDGET_USD);
  });

  it('passes under budget and throws a typed error at or over it', async () => {
    await expect(assertBudget(source(7.99))).resolves.toBeUndefined();
    resetSpendCache();
    const err = await assertBudget(source(8)).catch((e) => e);
    expect(err).toBeInstanceOf(BudgetExceededError);
    expect(err.message).toBe('Budget reached ($8.00 of $8.00). Raise SHIPYARD_BUDGET_USD to continue.');
  });

  it('caches the spend sum for 30 s', async () => {
    const s = source(1);
    const t0 = 5_000_000;
    await currentSpendUsd(s, t0);
    await currentSpendUsd(s, t0 + SPEND_CACHE_MS - 1);
    expect(s.calls).toBe(1);
    await currentSpendUsd(s, t0 + SPEND_CACHE_MS);
    expect(s.calls).toBe(2);
  });

  it('fails open when the spend cannot be read', async () => {
    await expect(assertBudget({ totalSpendUsd: async () => Promise.reject(new Error('db down')) })).resolves.toBeUndefined();
  });
});

describe('runner budget check', () => {
  const spec: AgentSpec = {
    name: 'collections-agent',
    goal: 'Help members.',
    profile: 'fast',
    inherit: [],
    tools: [],
    instructions: '',
    test_packs: [],
    gate: { min_pass_rate: 1, runs_per_scenario: 1, variants: 0 },
  };
  let db: TestDb;
  beforeAll(async () => {
    db = await pgliteDb();
  });
  afterAll(async () => {
    await db.close();
  });

  it('ends the run as error with the budget message and makes no model call', async () => {
    const model = new MockLanguageModelV4({ doGenerate: async () => Promise.reject(new Error('should not be called')) });
    const { repo, events, runs } = memoryRepo();
    const run = createRunner({ ...repo, totalSpendUsd: async () => 9 });
    const r = await run({
      spec,
      version: 1,
      messages: [{ role: 'user', content: 'hi' }],
      db,
      mode: 'scenario',
      scenario: 's',
      modelOverride: model,
    });
    expect(r.outcome).toBe('error');
    expect(r.final_reply).toBe('Budget reached ($9.00 of $8.00). Raise SHIPYARD_BUDGET_USD to continue.');
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(events.some((e) => e.type === 'error' && e.name === 'budget')).toBe(true);
    expect(runs[0]).toMatchObject({ outcome: 'error' });
  });
});
