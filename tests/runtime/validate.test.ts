import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateSpec } from '../../lib/spec/validate';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function loadAgent(name: string) {
  const dir = path.join(ROOT, 'agents', name, 'scenarios');
  const scenarios: Record<string, string> = {};
  for (const f of fs.readdirSync(dir)) scenarios[f] = fs.readFileSync(path.join(dir, f), 'utf8');
  return { spec: read(`agents/${name}/spec.yaml`), scenarios };
}

const support = loadAgent('support-agent');
const oneScenario = { 'balance-question.yaml': support.scenarios['balance-question.yaml'] };
const msgs = (r: ReturnType<typeof validateSpec>) => r.errors.map((e) => `${e.path}: ${e.message}`).join('\n');

describe('validateSpec', () => {
  it('accepts every shipped agent', () => {
    const agents = fs
      .readdirSync(path.join(ROOT, 'agents'))
      .filter((d) => !d.startsWith('_') && fs.statSync(path.join(ROOT, 'agents', d)).isDirectory());
    for (const a of agents) {
      const { spec, scenarios } = loadAgent(a);
      const r = validateSpec(spec, scenarios);
      expect(r.ok, `${a}:\n${msgs(r)}`).toBe(true);
      expect(r.scenarios?.length).toBe(Object.keys(scenarios).length);
    }
  });

  it('parses support-agent with test_packs and gate defaults', () => {
    const r = validateSpec(support.spec, support.scenarios);
    expect(r.ok).toBe(true);
    expect(r.spec?.test_packs).toContain('security');
    expect(r.spec?.gate).toEqual({ min_pass_rate: 1, runs_per_scenario: 1, variants: 0 });
    expect(r.scenarios?.every((s) => s.source === 'spec')).toBe(true);
  });

  it('accepts gate.variants', () => {
    const r = validateSpec(support.spec.replace('runs_per_scenario: 1', 'runs_per_scenario: 1\n  variants: 2'), oneScenario);
    expect(r.ok, msgs(r)).toBe(true);
    expect(r.spec?.gate.variants).toBe(2);
  });

  it('flags an unknown tool with a suggestion', () => {
    const r = validateSpec(support.spec.replace('tools: [accounts.get,', 'tools: [acounts.get,'), oneScenario);
    expect(r.ok).toBe(false);
    expect(r.errors).toContainEqual({ path: 'tools[0]', message: 'unknown tool "acounts.get" (did you mean "accounts.get"?)' });
  });

  it('flags an unknown block', () => {
    const r = validateSpec(support.spec.replace('inherit: [brand-tone,', 'inherit: [brand-tones,'), oneScenario);
    expect(r.errors.some((e) => e.path === 'inherit[0]' && e.message.includes('unknown block "brand-tones"'))).toBe(true);
  });

  it('flags a bad profile', () => {
    const r = validateSpec(support.spec.replace('profile: careful', 'profile: turbo'), oneScenario);
    expect(r.errors.some((e) => e.path === 'profile' && e.message.includes('unknown profile "turbo"'))).toBe(true);
  });

  it('flags an unknown test pack', () => {
    const r = validateSpec(support.spec.replace('test_packs: [security,', 'test_packs: [securty,'), oneScenario);
    expect(r.errors.some((e) => e.path === 'test_packs[0]')).toBe(true);
  });

  it('flags a bad assertion column and table', () => {
    const bad = `name: bad-cols
setup:
  accounts: [{id: A-100, owner: Dana, email: d@lonestarcu.org, balance: 1, monthly_payment: 1, colour: red}]
conversation: [{user: hi}]
assert:
  - {table: credits, where: {acount_id: A-100}, count: 0}
  - {table: credit, where: {}, count: 0}
  - {table: credits, where: {}, sum: amout, lte: 25}
`;
    const r = validateSpec(support.spec, { 'bad-cols.yaml': bad });
    const text = msgs(r);
    expect(r.ok).toBe(false);
    expect(text).toContain('scenarios/bad-cols.yaml.assert[0].where.acount_id: unknown column "acount_id"');
    expect(text).toContain('assert[1].table: unknown table "credit"');
    expect(text).toContain('assert[2].sum: unknown column "amout"');
    expect(text).toContain('setup.accounts[0].colour');
  });

  it('enforces exactly one check per assertion', () => {
    const bad = `name: two-checks
conversation: [{user: hi}]
assert:
  - {table: credits, where: {}, count: 0, count_lte: 1}
  - {table: credits, where: {}}
  - {where: {}, reply_not_contains: "guarantee"}
`;
    const r = validateSpec(support.spec, { 'two-checks.yaml': bad });
    expect(r.errors.filter((e) => e.message.includes('exactly one check'))).toHaveLength(2);
    expect(r.errors.some((e) => e.path.includes('assert[2]'))).toBe(false);
  });

  it('reports invalid YAML with a line number', () => {
    const r = validateSpec('name: x\ngoal: y\ntools: [a, b\nprofile: careful\n', oneScenario);
    expect(r.ok).toBe(false);
    expect(r.errors[0].path).toBe('spec');
    expect(r.errors[0].message).toMatch(/invalid YAML at line \d+/);
  });

  it('requires at least one scenario', () => {
    const r = validateSpec(support.spec, {});
    expect(r.errors).toContainEqual({ path: 'scenarios', message: 'at least one scenario is required' });
  });
});
