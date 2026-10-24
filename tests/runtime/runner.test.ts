import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { createRunner } from '../../lib/runtime/runner';
import type { AgentSpec } from '../../lib/types';
import { DANA, memoryRepo, pgliteDb, seed, type TestDb } from './helpers';

const spec: AgentSpec = {
  name: 'support-agent',
  goal: 'Help members.',
  profile: 'careful',
  inherit: ['brand-tone'],
  tools: ['accounts.get', 'accounts.apply_credit', 'payments.defer'],
  instructions: '',
  test_packs: [],
  gate: { min_pass_rate: 1, runs_per_scenario: 1, variants: 0 },
};

const u = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
const call = (id: string, toolName: string, input: unknown) => ({
  content: [{ type: 'tool-call' as const, toolCallId: id, toolName, input: JSON.stringify(input) }],
  finishReason: { unified: 'tool-calls' as const, raw: 'tool_use' },
  usage: u,
  warnings: [],
});
const text = (t: string) => ({
  content: [{ type: 'text' as const, text: t }],
  finishReason: { unified: 'stop' as const, raw: 'end_turn' },
  usage: u,
  warnings: [],
});

let db: TestDb;
beforeAll(async () => {
  db = await pgliteDb();
  await seed(db, { accounts: [DANA] });
});
afterAll(async () => {
  await db.close();
});

describe('runAgent (mock model, PGlite)', () => {
  it('runs tools through policies, logs events and never throws', async () => {
    const mock = new MockLanguageModelV4({
      doGenerate: [
        call('c1', 'accounts_get', { account_id: 'A-100' }),
        call('c2', 'accounts_apply_credit', { account_id: 'A-100', amount: 200, reason: 'please' }),
        call('c3', 'payments_defer', { account_id: 'A-100', months: 1, reason: 'tight month' }),
        text('Your balance is $412.00.'),
      ],
    });
    const { repo, events, runs } = memoryRepo();
    const r = await createRunner(repo)({
      spec,
      version: 1,
      messages: [{ role: 'user', content: 'balance?' }],
      db,
      mode: 'scenario',
      modelOverride: mock,
    });
    expect(r.outcome).toBe('ok');
    expect(r.final_reply).toBe('Your balance is $412.00.');
    expect(r.tokens_in).toBe(40);
    const types = events.map((e) => `${e.type}:${e.name ?? ''}`);
    expect(types).toContain('tool_call:accounts.get');
    expect(types).toContain('policy_block:accounts.apply_credit');
    expect(types).toContain('approval:payments.defer');
    expect(types.filter((t) => t.startsWith('model_call'))).toHaveLength(4);
    expect(runs[0]).toMatchObject({ outcome: 'ok', final_reply: 'Your balance is $412.00.' });
    expect(await db.query('select * from sys.credits')).toHaveLength(0);
    expect(await db.query('select * from sys.deferrals')).toHaveLength(0);
    expect(await db.query(`select * from sys.approvals where status = 'pending'`)).toHaveLength(1);
  });

  it('returns outcome error instead of throwing when the model fails', async () => {
    const mock = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error('boom');
      },
    });
    const { repo, events } = memoryRepo();
    const r = await createRunner(repo)({ spec, version: null, messages: [{ role: 'user', content: 'hi' }], db, mode: 'live', modelOverride: mock });
    expect(r.outcome).toBe('error');
    expect(events.some((e) => e.type === 'error')).toBe(true);
  });
});
