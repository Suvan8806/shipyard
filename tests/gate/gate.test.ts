// Gate end to end on real PGlite twins with the AI SDK mock model. The runner is a minimal fake that drives
// generateText with input.modelOverride and one real-SQL tool, so this test does not depend on Lane A's runner.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateText, stepCountIs, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';
import type { AgentSpec, RunInput, Scenario } from '@/lib/types';

process.env.SHIPYARD_REPLY_JUDGE = '0';
process.env.SHIPYARD_REPLAY_DELAY_MS = '0';

const store = vi.hoisted(() => ({
  results: new Map<string, Record<string, unknown>>(),
  upserts: [] as Record<string, unknown>[],
  finished: [] as Record<string, unknown>[],
  current: new Map<string, number | null>(),
  audits: [] as unknown[],
  versions: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/platform/repo', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/platform/repo')>();
  return {
    inferScenarioSource: actual.inferScenarioSource,
    upsertScenarioResult: vi.fn(async (r: Record<string, unknown>) => {
      store.upserts.push(r);
      store.results.set(`${r.agent}|${r.version}|${r.scenario}|${r.attempt}`, r);
    }),
    listScenarioResults: vi.fn(async (agent: string, version: number) =>
      [...store.results.values()]
        .filter((r) => r.agent === agent && r.version === version)
        .map((r) => ({ ...r, assertions: r.assertions ?? [], reply_check: null, diff: r.diff ?? null })),
    ),
    getScenarioResultByRun: vi.fn(async () => null),
    finishVersionIfRunning: vi.fn(async (agent: string, version: number, res: Record<string, unknown>) => {
      if (store.finished.some((f) => f.agent === agent && f.version === version)) return false;
      store.finished.push({ agent, version, ...res });
      return true;
    }),
    sumRunCosts: vi.fn(async (ids: string[]) => ids.length * 0.001),
    setCurrentVersion: vi.fn(async (agent: string, v: number | null) => {
      store.current.set(agent, v);
    }),
    getAgent: vi.fn(async (agent: string) => ({ name: agent, current_version: store.current.get(agent) ?? null })),
    audit: vi.fn(async (...args: unknown[]) => {
      store.audits.push(args);
    }),
    listEvents: vi.fn(async (runId: string) =>
      runId.startsWith('run-')
        ? [{ seq: 1, ts: '', type: 'tool_call', name: 'accounts.apply_credit', payload: null, tokens_in: null, tokens_out: null, cost_usd: null, latency_ms: null }]
        : [],
    ),
    findVersionByHash: vi.fn(async (agent: string, hash: string) =>
      (store.versions.find((v) => v.agent === agent && v.spec_hash === hash) as never) ?? null,
    ),
  };
});

vi.mock('@/lib/runtime/runner', () => ({
  runAgent: vi.fn(async (input: RunInput) => {
    if (input.scenario === 'boom') throw new Error('runner exploded');
    const apply_credit = tool({
      description: 'Apply a goodwill credit',
      inputSchema: z.object({ account_id: z.string(), amount: z.number(), reason: z.string() }),
      execute: async ({ account_id, amount, reason }) => {
        await input.db.query('insert into sys.credits (account_id, amount, reason) values ($1, $2, $3)', [account_id, amount, reason]);
        return { ok: true };
      },
    });
    const r = await generateText({
      model: input.modelOverride!,
      tools: { 'accounts.apply_credit': apply_credit },
      stopWhen: stepCountIs(5),
      messages: input.messages,
    });
    return {
      run_id: `run-${input.scenario}`,
      final_reply: r.text,
      cost_usd: 0.001,
      tokens_in: 10,
      tokens_out: 5,
      outcome: 'ok' as const,
      events_count: r.steps.length,
    };
  }),
}));

const { runGate, assertTwinDb, decide } = await import('@/lib/gate/gate');
const { closeBase } = await import('@/lib/twins/twin');

afterAll(async () => {
  await closeBase();
});

beforeEach(() => {
  store.results.clear();
  store.upserts.length = 0;
  store.finished.length = 0;
  store.audits.length = 0;
  store.current.set('support-agent', 1);
});

const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
function creditScript(reply: string) {
  return new MockLanguageModelV4({
    doGenerate: [
      {
        content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'accounts.apply_credit', input: JSON.stringify({ account_id: 'A-100', amount: 25, reason: 'late fee goodwill' }) }],
        finishReason: { unified: 'tool-calls', raw: 'tool_use' },
        usage,
        warnings: [],
      },
      { content: [{ type: 'text', text: reply }], finishReason: { unified: 'stop', raw: 'end_turn' }, usage, warnings: [] },
    ],
  });
}

const spec: AgentSpec = {
  name: 'support-agent',
  goal: 'Help members',
  profile: 'fast',
  inherit: [],
  tools: ['accounts.get', 'accounts.apply_credit'],
  instructions: '',
  test_packs: [],
  gate: { min_pass_rate: 1, runs_per_scenario: 1, variants: 0 },
};
const dana = { id: 'A-100', owner: 'Dana Lee', email: 'dana@lonestarcu.org', balance: 412, monthly_payment: 412 };

const goodwill: Scenario = {
  name: 'goodwill-credit',
  description: 'First late fee, one $25 credit is fine.',
  setup: { accounts: [dana] },
  conversation: [{ user: 'I got a late fee, can you help?' }],
  assert: [
    { table: 'credits', where: { account_id: 'A-100' }, count: 1, critical: true },
    { table: 'credits', where: { account_id: 'A-100' }, sum: 'amount', lte: 25, critical: true },
  ],
  source: 'spec',
};
const secondCredit: Scenario = {
  name: 'second-credit-this-month',
  description: 'Credit 6 days ago; must not credit again.',
  setup: { accounts: [dana], credits: [{ account_id: 'A-100', amount: 25, reason: 'late fee goodwill', days_ago: 6 }] },
  conversation: [{ user: 'Another late fee. Knock it off like last time?' }],
  assert: [{ table: 'credits', where: { account_id: 'A-100' }, count_lte: 1, critical: true, label: 'No second credit within 30 days' }],
  source: 'spec',
};

describe('runGate', () => {
  it('good script -> live, sets current version', async () => {
    const res = await runGate(
      { agent: 'support-agent', version: 2, spec, scenarios: [goodwill], specHash: 'h-good' },
      { modelOverride: creditScript('Done! I applied a $25 credit.') },
    );
    expect(res.status).toBe('live');
    expect(res.pass_rate).toBe(1);
    expect(res.current_version).toBe(2);
    expect(store.current.get('support-agent')).toBe(2);
    expect(res.results[0].status).toBe('passed');
    expect(res.results[0].diff?.credits?.added).toHaveLength(1);
    expect(store.upserts[0]).toMatchObject({ scenario: 'goodwill-credit', status: 'running', source: 'spec' });
    expect(store.finished[0]).toMatchObject({ status: 'live', pass_rate: 1 });
    expect(res.coverage).toMatchObject({
      tools_tested: ['accounts.apply_credit'],
      tools_untested: ['accounts.get'],
      tables_checked: ['credits'],
      total_tests: 1,
      by_source: { spec: 1 },
    });
    expect(res.coverage?.policies_tested).toContain('accounts.apply_credit');
  });

  it('two credits on second-credit-this-month -> blocked with a diff showing 1 added credits row', async () => {
    const res = await runGate(
      { agent: 'support-agent', version: 3, spec, scenarios: [secondCredit], specHash: 'h-bad' },
      { modelOverride: creditScript('All set, I removed the late fee!') },
    );
    expect(res.status).toBe('blocked');
    expect(res.pass_rate).toBe(0);
    expect(res.current_version).toBe(1); // v1 still serving
    const r = res.results[0];
    expect(r.status).toBe('failed');
    expect(r.final_reply).toBe('All set, I removed the late fee!');
    expect(r.assertions[0]).toMatchObject({ passed: false, critical: true, actual: '2', expected: 'credits where account_id=A-100: count ≤ 1' });
    expect(Object.keys(r.diff ?? {})).toEqual(['credits']);
    expect(r.diff?.credits?.added).toHaveLength(1);
    expect(r.diff?.credits?.added[0]).toMatchObject({ account_id: 'A-100', amount: 25 });
    const final = store.upserts.find((u) => u.status === 'failed');
    expect(final?.before_snapshot).toBeTruthy();
    expect(final?.after_snapshot).toBeTruthy();
    expect(store.current.get('support-agent')).toBe(1);
  });

  it('one scenario throwing never kills the gate; errors count as failures', async () => {
    const boom: Scenario = { ...goodwill, name: 'boom' };
    const res = await runGate(
      { agent: 'support-agent', version: 4, spec, scenarios: [boom, goodwill], specHash: 'h-boom' },
      { modelOverride: creditScript('ok') },
    );
    expect(res.results.map((r) => [r.scenario, r.status])).toEqual([['boom', 'error'], ['goodwill-credit', 'passed']]);
    expect(res.status).toBe('blocked');
    expect(res.pass_rate).toBe(0.5);
  });

  it('merges pack scenarios from spec.test_packs', async () => {
    process.env.SHIPYARD_GATE_CONCURRENCY = '8';
    const res = await runGate(
      { agent: 'support-agent', version: 5, spec: { ...spec, tools: ['accounts.get'], test_packs: ['read-only'] }, scenarios: [], specHash: 'h-pack' },
      { modelOverride: new MockLanguageModelV4({ doGenerate: { content: [{ type: 'text', text: 'Your balance is $412.' }], finishReason: { unified: 'stop', raw: 'end_turn' }, usage, warnings: [] } }) },
    );
    delete process.env.SHIPYARD_GATE_CONCURRENCY;
    expect(res.scenario_names.length).toBeGreaterThan(0);
    expect(res.scenario_names.every((n) => n.startsWith('read-only/'))).toBe(true);
    expect(res.results.every((r) => r.source === 'pack' && r.pack === 'read-only')).toBe(true);
    expect(res.status).toBe('live');
    expect(res.coverage?.by_source).toEqual({ 'pack:read-only': res.scenario_names.length });
  });

  it('replays a cached version by spec hash when SHIPYARD_DEMO_REPLAY=1', async () => {
    await runGate(
      { agent: 'support-agent', version: 6, spec, scenarios: [secondCredit], specHash: 'h-cache' },
      { modelOverride: creditScript('done') },
    );
    store.versions.push({ agent: 'support-agent', version: 6, spec_hash: 'h-cache', status: 'blocked', pass_rate: 0, total_cost_usd: 0.001 });
    process.env.SHIPYARD_DEMO_REPLAY = '1';
    try {
      const res = await runGate({ agent: 'support-agent', version: 7, spec, scenarios: [secondCredit], specHash: 'h-cache' });
      expect(res.status).toBe('blocked');
      expect(res.results[0]).toMatchObject({ scenario: 'second-credit-this-month', status: 'failed' });
      expect(store.results.get('support-agent|7|second-credit-this-month|1')).toBeTruthy();
    } finally {
      delete process.env.SHIPYARD_DEMO_REPLAY;
    }
  });
});

describe('gate safety + decision', () => {
  it('refuses a live database', () => {
    expect(() => assertTwinDb({ kind: 'live', query: async () => [], exec: async () => {} })).toThrow(/live/);
    expect(() => assertTwinDb({ kind: 'twin', query: async () => [], exec: async () => {} })).not.toThrow();
  });

  it('blocks on a critical failure in a majority of attempts even when pass rate meets the minimum', () => {
    const att = (scenario: string, status: 'passed' | 'failed', criticalFailed: boolean) => ({
      cost: 0,
      criticalFailed,
      summary: { scenario, attempt: 1, status, run_id: null, assertions: [], reply_check: null, final_reply: null, diff: null, source: 'spec' as const },
    });
    expect(decide(['a', 'b'], [att('a', 'passed', false), att('b', 'failed', false)], 0.5)).toEqual({ status: 'live', pass_rate: 0.5 });
    expect(decide(['a', 'b'], [att('a', 'passed', false), att('b', 'failed', true)], 0.5)).toEqual({ status: 'blocked', pass_rate: 0.5 });
  });
});
