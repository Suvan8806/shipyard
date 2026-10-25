import { describe, expect, test } from 'vitest';
import type { ScenarioResultSummary } from '@/lib/types';
import type { MatrixModel } from '@/lib/contracts/stress';
import {
  batchSizes,
  bestModel,
  classifyChange,
  estimateCostUsd,
  lineDiff,
  matrixHeadline,
  redteamAttacks,
  redteamHeadline,
  reliabilityHeadline,
  reliabilityOf,
  scenarioChanges,
  scenarioStatuses,
} from '@/lib/stress/math';
import { fromStressId, toStressId } from '@/lib/stress/meta';
import { themesForBatch, ATTACK_THEMES } from '@/lib/services/stress';

const row = (
  scenario: string,
  attempt: number,
  status: ScenarioResultSummary['status'],
  extra: Partial<ScenarioResultSummary> = {},
): ScenarioResultSummary => ({
  scenario,
  attempt,
  status,
  run_id: `${scenario}-${attempt}`,
  assertions: [],
  reply_check: null,
  final_reply: null,
  diff: null,
  source: 'spec',
  ...extra,
});

describe('reliability', () => {
  test('flaky = some but not all attempts passed; pct = passed / finished attempts', () => {
    const rows = [
      row('a', 1, 'passed'), row('a', 2, 'passed'), row('a', 3, 'passed'),
      row('b', 1, 'passed'), row('b', 2, 'failed'), row('b', 3, 'passed'),
      row('c', 1, 'failed'), row('c', 2, 'error'), row('c', 3, 'failed'),
    ];
    const r = reliabilityOf(rows, 3, ['a', 'b', 'c']);
    expect(r.scenarios.map((s) => [s.scenario, s.passes, s.runs, s.flaky])).toEqual([
      ['a', 3, 3, false],
      ['b', 2, 3, true],
      ['c', 0, 3, false],
    ]);
    expect(r.reliability_pct).toBe(55.6); // 5 / 9
    expect(reliabilityHeadline(r, false, 9)).toBe('Reliability 55.6% · 1 flaky test');
  });

  test('running attempts are not graded; nothing finished -> null', () => {
    const r = reliabilityOf([row('a', 1, 'running'), row('a', 2, 'running')], 2, ['a', 'b']);
    expect(r.reliability_pct).toBeNull();
    expect(r.scenarios.find((s) => s.scenario === 'b')).toMatchObject({ passes: 0, runs: 0, flaky: false });
    expect(reliabilityHeadline(r, true, 4)).toBe('Reliability: 0/4 attempts done');
  });
});

describe('cost estimate', () => {
  test('tests x runs x $0.006', () => {
    expect(estimateCostUsd({ mode: 'reliability', tests: 46, runs: 3 })).toBe(0.828);
    expect(estimateCostUsd({ mode: 'matrix', tests: 46, models: 3 })).toBe(0.828);
  });
  test('redteam adds one generation batch per 15 attacks', () => {
    expect(estimateCostUsd({ mode: 'redteam', tests: 0, count: 30 })).toBe(0.2); // 0.18 + 2 x 0.01
    expect(estimateCostUsd({ mode: 'redteam', tests: 0, count: 10 })).toBe(0.07);
  });
  test('batch sizes', () => {
    expect(batchSizes(32)).toEqual([15, 15, 2]);
    expect(batchSizes(10)).toEqual([10]);
    expect(batchSizes(0)).toEqual([]);
  });
  test('one batch gets every theme; six batches get one each', () => {
    expect(themesForBatch(0, 1)).toBe(ATTACK_THEMES.join('; '));
    expect(themesForBatch(2, 6)).toBe(ATTACK_THEMES[2]);
  });
});

describe('red team', () => {
  test('broke through = failed attacks; labels of failed assertions', () => {
    const failing = row('gen-x', 1, 'failed', {
      assertions: [
        { assertion: { where: {}, critical: true, label: 'No external email' }, passed: false, expected: '0', actual: '1', critical: true },
        { assertion: { where: {}, critical: false }, passed: true, expected: '1', actual: '1', critical: false },
      ],
    });
    const attacks = redteamAttacks(
      [{ name: 'gen-x', description: 'x' }, { name: 'gen-y', description: 'y' }, { name: 'gen-z', description: 'z' }],
      [failing, row('gen-y', 1, 'passed')],
    );
    expect(attacks.map((a) => a.status)).toEqual(['failed', 'passed', 'running']);
    expect(attacks[0].failed_assertions).toEqual(['No external email']);
    expect(redteamHeadline(attacks, 'testing')).toBe('Red team: 2/3 attacks run, 1 broke through so far');
    expect(redteamHeadline(attacks, 'done')).toBe('Red team: 3 attacks, 1 broke through');
  });
});

describe('matrix', () => {
  const m = (model: string, pass_rate: number | null, cost_usd: number | null): MatrixModel => ({
    model, version: null, status: 'live', pass_rate, cost_usd, avg_latency_ms: 1000, failed: [],
  });
  test('best = highest pass rate, then cheapest', () => {
    const models = [m('google/gemini-3.5-flash', 1, 0.28), m('google/gemini-3.5-flash-lite', 1, 0.05), m('groq/openai/gpt-oss-20b', 0.9, 0.01)];
    expect(bestModel(models)?.model).toBe('google/gemini-3.5-flash-lite');
    expect(matrixHeadline(models, false)).toBe('gemini-3.5-flash-lite wins: 100% at $0.05');
    expect(bestModel([m('a/b', null, null)])).toBeNull();
  });
});

describe('version diff', () => {
  test('LCS line diff keeps common lines and marks adds/dels', () => {
    const d = lineDiff('name: a\nprofile: fast\ntools: [x]\n', 'name: a\nprofile: careful\ntools: [x]\n');
    expect(d.map((l) => `${l.kind}:${l.text}`)).toEqual(['same:name: a', 'del:profile: fast', 'add:profile: careful', 'same:tools: [x]', 'same:']);
    expect(d.find((l) => l.kind === 'add')?.line).toBe(2);
  });
  test('identical and empty inputs', () => {
    expect(lineDiff('a\nb', 'a\nb').every((l) => l.kind === 'same')).toBe(true);
    expect(lineDiff('', 'x').map((l) => l.kind)).toEqual(['del', 'add']);
  });
  test('scenario statuses use the majority of attempts', () => {
    const s = scenarioStatuses([
      row('a', 1, 'passed'), row('a', 2, 'failed'), row('a', 3, 'passed'),
      row('b', 1, 'error'), row('c', 1, 'failed'), row('c', 2, 'error'),
    ]);
    expect(Object.fromEntries(s)).toEqual({ a: 'passed', b: 'error', c: 'failed' });
  });
  test('change classification and ordering', () => {
    expect(classifyChange('passed', 'failed')).toBe('newly_failing');
    expect(classifyChange('error', 'passed')).toBe('fixed');
    expect(classifyChange(null, 'passed')).toBe('added');
    expect(classifyChange('failed', null)).toBe('removed');
    const changes = scenarioChanges(
      new Map([['ok', 'passed'], ['broke', 'passed'], ['gone', 'passed']]),
      new Map([['ok', 'passed'], ['broke', 'failed'], ['new', 'passed']]),
    );
    expect(changes.map((c) => `${c.scenario}:${c.change}`)).toEqual(['broke:newly_failing', 'new:added', 'gone:removed', 'ok:still_passing']);
  });
});

describe('stress ids', () => {
  test('round trip and rejects junk', () => {
    expect(toStressId(-7)).toBe('s7');
    expect(fromStressId('s7')).toBe(-7);
    expect(fromStressId('7')).toBeNull();
    expect(fromStressId('s0')).toBeNull();
    expect(fromStressId('s-1')).toBeNull();
  });
});
