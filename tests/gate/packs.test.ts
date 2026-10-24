import { describe, expect, it } from 'vitest';
import { expandPacks, expandTestPacks, fillPlaceholders, loadPacks } from '@/lib/gate/packs';
import { isSysColumn, isSysTable } from '@/lib/sysdb/schema';
import type { AgentSpec } from '@/lib/types';

const support: AgentSpec = {
  name: 'support-agent',
  goal: 'Help members',
  profile: 'careful',
  inherit: [],
  tools: ['accounts.get', 'accounts.apply_credit', 'payments.defer', 'crm.add_note', 'approval.request', 'email.send'],
  instructions: '',
  test_packs: ['security', 'compliance', 'money-safety', 'read-only', 'escalation'],
  gate: { min_pass_rate: 1, runs_per_scenario: 1, variants: 0 },
};

describe('test packs', () => {
  it('loads the 5 library packs', () => {
    const packs = loadPacks();
    expect(packs.map((p) => p.name).sort()).toEqual(['compliance', 'escalation', 'money-safety', 'read-only', 'security']);
    expect(packs.reduce((n, p) => n + p.templates.length, 0)).toBeGreaterThanOrEqual(38);
  });

  it('expands about 39 filled scenarios for support-agent', () => {
    const scenarios = expandTestPacks(support);
    expect(scenarios.length).toBeGreaterThanOrEqual(35);
    expect(scenarios.length).toBeLessThanOrEqual(45);
    for (const s of scenarios) {
      expect(s.source).toBe('pack');
      expect(s.name).toBe(`${s.pack}/${s.name.split('/')[1]}`);
      expect(s).not.toHaveProperty('requires_tools');
      expect(JSON.stringify(s)).not.toMatch(/\{\{/);
      for (const t of Object.keys(s.setup)) expect(isSysTable(t)).toBe(true);
      for (const a of s.assert) {
        if (a.table) {
          expect(isSysTable(a.table)).toBe(true);
          for (const k of Object.keys(a.where)) expect(isSysColumn(a.table, k)).toBe(true);
        }
      }
    }
    const fake = scenarios.find((s) => s.name === 'security/fake-admin-mode');
    expect(fake?.setup.accounts?.[0]).toMatchObject({ id: 'A-100', owner: 'Dana Lee', email: 'dana@lonestarcu.org', balance: 412 });
    expect(fake?.assert[0].where).toEqual({ account_id: 'A-100' });
  });

  it('applies a template only when the agent has every required tool', () => {
    const readOnly = expandTestPacks({ ...support, tools: ['accounts.get'] });
    expect(readOnly.length).toBeGreaterThan(0);
    expect(expandTestPacks({ ...support, tools: [] })).toEqual([]);
    expect(expandTestPacks({ ...support, test_packs: [] })).toEqual([]);
    expect(expandTestPacks({ ...support, test_packs: ['nope'] })).toEqual([]);
  });

  it('fills placeholders from pack defaults recursively, strings only', () => {
    const out = fillPlaceholders(
      { a: '{{account}}/{{member}}', n: 412, b: true, list: [{ x: '{{other_email}}' }], keep: '{{unknown}}' },
      { account: 'A-1', member: 'Dana', other_email: 'm@x' },
    );
    expect(out).toEqual({ a: 'A-1/Dana', n: 412, b: true, list: [{ x: 'm@x' }], keep: '{{unknown}}' });
  });

  it('uses each pack\'s own defaults', () => {
    const [s] = expandPacks(
      { tools: ['t'], test_packs: ['p'] },
      [{
        name: 'p', description: '', defaults: { account: 'Z-9' },
        templates: [{ name: 'x', description: '', requires_tools: ['t'], setup: {}, conversation: [{ user: 'hi {{account}}' }], assert: [], source: 'pack' }],
      }],
    );
    expect(s.conversation[0].user).toBe('hi Z-9');
    expect(s.name).toBe('p/x');
  });
});
