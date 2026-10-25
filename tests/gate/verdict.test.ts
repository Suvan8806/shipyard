// Fan-out finalize: verdict from stored rows (same rule as runGate) and idempotent version finish.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssertionOutcome, ScenarioResultSummary } from '@/lib/types';

const db = vi.hoisted(() => ({
  rows: [] as import('@/lib/types').ScenarioResultSummary[],
  versionStatus: new Map<string, string>(),
  current: new Map<string, number | null>(),
  audits: [] as unknown[][],
  finishes: 0,
}));

vi.mock('@/lib/platform/repo', () => ({
  listScenarioResults: vi.fn(async () => db.rows),
  sumRunCosts: vi.fn(async (ids: string[]) => ids.length * 0.002),
  // Mirrors the SQL: update ... where status = 'running' returning version.
  finishVersionIfRunning: vi.fn(async (agent: string, version: number, res: { status: string }) => {
    const key = `${agent}@${version}`;
    if (db.versionStatus.get(key) !== 'running') return false;
    db.versionStatus.set(key, res.status);
    db.finishes++;
    return true;
  }),
  setCurrentVersion: vi.fn(async (agent: string, v: number | null) => void db.current.set(agent, v)),
  getAgent: vi.fn(async (agent: string) => ({ name: agent, current_version: db.current.get(agent) ?? null })),
  audit: vi.fn(async (...args: unknown[]) => void db.audits.push(args)),
}));

const { finalizeVersion, decide } = await import('@/lib/gate/verdict');
const { attemptFromSummary } = await import('@/lib/gate/attempt');

const ok: AssertionOutcome = { label: 'ok', passed: true, critical: true, expected: '', actual: '' } as unknown as AssertionOutcome;
const critFail: AssertionOutcome = { ...ok, passed: false };
const softFail: AssertionOutcome = { ...ok, passed: false, critical: false };
const row = (scenario: string, status: ScenarioResultSummary['status'], assertions: AssertionOutcome[] = [], attempt = 1): ScenarioResultSummary => ({
  scenario,
  attempt,
  status,
  run_id: `run-${scenario}-${attempt}`,
  assertions,
  reply_check: null,
  final_reply: null,
  diff: null,
  source: 'spec',
});

beforeEach(() => {
  db.rows = [];
  db.versionStatus.clear();
  db.versionStatus.set('collections-agent@3', 'running');
  db.current.set('collections-agent', 2);
  db.audits.length = 0;
  db.finishes = 0;
});

describe('finalizeVersion', () => {
  it('waits while any attempt is still running/queued', async () => {
    db.rows = [row('a', 'passed', [ok]), row('b', 'running')];
    expect(await finalizeVersion({ agent: 'collections-agent', version: 3, minPassRate: 1 })).toBeNull();
    expect(db.versionStatus.get('collections-agent@3')).toBe('running');
  });

  it('all passed -> live, sets current version, sums run costs', async () => {
    db.rows = [row('a', 'passed', [ok]), row('b', 'passed', [ok])];
    const r = await finalizeVersion({ agent: 'collections-agent', version: 3, minPassRate: 1 });
    expect(r).toMatchObject({ status: 'live', pass_rate: 1, applied: true, current_version: 3, total_cost_usd: 0.004 });
    expect(db.current.get('collections-agent')).toBe(3);
  });

  it('is idempotent: concurrent/repeated finalizers apply the verdict exactly once', async () => {
    db.rows = [row('a', 'passed', [ok]), row('credit-on-zero-balance', 'failed', [critFail])];
    const results = await Promise.all([
      finalizeVersion({ agent: 'collections-agent', version: 3, minPassRate: 1 }),
      finalizeVersion({ agent: 'collections-agent', version: 3, minPassRate: 1 }),
      finalizeVersion({ agent: 'collections-agent', version: 3, minPassRate: 1 }),
    ]);
    expect(results.filter((r) => r?.applied)).toHaveLength(1);
    expect(results.every((r) => r?.status === 'blocked')).toBe(true);
    expect(db.finishes).toBe(1);
    expect(db.audits).toHaveLength(1);
    expect(db.current.get('collections-agent')).toBe(2); // blocked: previous version keeps serving
    const again = await finalizeVersion({ agent: 'collections-agent', version: 3, minPassRate: 1 });
    expect(again?.applied).toBe(false);
    expect(db.finishes).toBe(1);
  });

  it('errored (e.g. rate-limit exhausted or swept) attempts count as critical failures -> blocked', async () => {
    db.rows = [row('a', 'passed', [ok]), row('b', 'error')];
    const r = await finalizeVersion({ agent: 'collections-agent', version: 3, minPassRate: 0.5 });
    expect(r).toMatchObject({ status: 'blocked', pass_rate: 0.5 });
  });

  it('expected scenarios with no row (never started) count as not passed', async () => {
    db.rows = [row('a', 'passed', [ok])];
    const r = await finalizeVersion({ agent: 'collections-agent', version: 3, minPassRate: 1, expectedNames: ['a', 'b'] });
    expect(r).toMatchObject({ status: 'blocked', pass_rate: 0.5 });
  });

  it('matches runGate verdict rules: majority vote per scenario, soft failures only lower the pass rate', async () => {
    db.rows = [
      row('a', 'passed', [ok], 1),
      row('a', 'passed', [ok], 2),
      row('a', 'failed', [critFail], 3),
      row('b', 'failed', [softFail], 1),
    ];
    const r = await finalizeVersion({ agent: 'collections-agent', version: 3, minPassRate: 0.5 });
    expect(r).toMatchObject({ status: 'live', pass_rate: 0.5 });
    expect(decide(['a', 'b'], db.rows.map((x) => attemptFromSummary(x)), 0.5)).toEqual({
      status: 'live',
      pass_rate: 0.5,
    });
  });
});
