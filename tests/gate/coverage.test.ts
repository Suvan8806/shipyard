// Gate coverage on read: scenario names (incl. paraphrase variants and unknown names) + tool events.
import { describe, expect, it } from 'vitest';
import { computeCoverage, scenariosForNames } from '../../lib/gate/coverage';
import type { AgentSpec, RunEvent, Scenario } from '../../lib/types';

const spec: AgentSpec = {
  name: 'collections-agent',
  goal: 'Collect.',
  profile: 'fast',
  inherit: [],
  tools: ['accounts.get', 'payments.credit', 'email.send'],
  instructions: '',
  test_packs: [],
  gate: { min_pass_rate: 1, runs_per_scenario: 1, variants: 1 },
};

const sc = (name: string, source: Scenario['source'], table?: string): Scenario => ({
  name,
  description: '',
  setup: {},
  conversation: [{ user: 'hi' }],
  assert: table ? [{ table: table as never, where: {}, count: 0, critical: true }] : [],
  source,
});

const ev = (type: RunEvent['type'], name: string): RunEvent => ({
  seq: 1,
  ts: new Date(0).toISOString(),
  type,
  name,
  payload: null,
  tokens_in: null,
  tokens_out: null,
  cost_usd: null,
  latency_ms: null,
});

describe('coverage on read', () => {
  const known = [sc('double-credit', 'spec', 'credits'), sc('gen-leak', 'generated', 'email_outbox')];
  const names = ['double-credit', 'double-credit~v1', 'gen-leak', 'gone-scenario'];
  const stub = (n: string) => sc(n, 'spec');

  it('resolves variants to their base scenario and stubs unknown names', () => {
    const out = scenariosForNames(known, names, stub);
    expect(out.map((s) => s.name)).toEqual(names);
    expect(out[1].assert).toEqual(known[0].assert);
    expect(out[3].assert).toEqual([]);
  });

  it('computes tools, policies, tables and per-source counts', () => {
    const events = [ev('tool_call', 'accounts.get'), ev('approval', 'payments.credit'), ev('tool_call', 'accounts.get')];
    const cov = computeCoverage(spec, scenariosForNames(known, names, stub), events);
    expect(cov.tools_tested).toEqual(['accounts.get', 'payments.credit']);
    expect(cov.tools_untested).toEqual(['email.send']);
    expect(cov.policies_tested).toContain('payments.credit');
    expect(cov.tables_checked).toEqual(['credits', 'email_outbox']);
    expect(cov.total_tests).toBe(4);
    expect(cov.by_source).toEqual({ spec: 3, generated: 1 });
  });
});
