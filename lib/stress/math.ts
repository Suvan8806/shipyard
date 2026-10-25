// Pure stress-test math: flakiness, red-team tallies, model matrix ranking, headlines, cost estimate, line diff.
// No I/O here so it can be unit tested (tests/stress/math.test.ts).
import {
  COST_PER_GENERATION_BATCH_USD,
  COST_PER_TEST_USD,
  REDTEAM_BATCH_SIZE,
  type DiffKind,
  type MatrixModel,
  type RedteamAttack,
  type ReliabilityReport,
  type ScenarioChange,
  type StressMode,
  type VersionDiff,
} from '../contracts/stress';
import type { ScenarioResultSummary, ScenarioStatus } from '../types';

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;
const isDone = (s: ScenarioStatus) => s !== 'running';

// ---------- cost ----------
export function estimateCostUsd(args: { mode: StressMode; tests: number; runs?: number; count?: number; models?: number }): number {
  const { mode, tests } = args;
  let usd: number;
  if (mode === 'reliability') usd = tests * Math.max(1, args.runs ?? 1) * COST_PER_TEST_USD;
  else if (mode === 'matrix') usd = tests * Math.max(1, args.models ?? 1) * COST_PER_TEST_USD;
  else {
    const count = Math.max(1, args.count ?? 1);
    usd = count * COST_PER_TEST_USD + Math.ceil(count / REDTEAM_BATCH_SIZE) * COST_PER_GENERATION_BATCH_USD;
  }
  return round(usd, 4);
}

/** Splits n into batch sizes of at most `size` (e.g. 32, 15 -> [15, 15, 2]). */
export function batchSizes(n: number, size = REDTEAM_BATCH_SIZE): number[] {
  const out: number[] = [];
  for (let left = Math.max(0, Math.floor(n)); left > 0; left -= size) out.push(Math.min(size, left));
  return out;
}

// ---------- reliability ----------
export function reliabilityOf(rows: ScenarioResultSummary[], runs: number, names: string[]): ReliabilityReport {
  const order = [...new Set([...names, ...rows.map((r) => r.scenario)])];
  let passed = 0;
  let graded = 0;
  const scenarios = order.map((scenario) => {
    const mine = rows.filter((r) => r.scenario === scenario);
    const done = mine.filter((r) => isDone(r.status));
    const passes = done.filter((r) => r.status === 'passed').length;
    passed += passes;
    graded += done.length;
    const first = mine[0];
    return {
      scenario,
      source: first?.source ?? 'spec',
      ...(first?.pack ? { pack: first.pack } : {}),
      passes,
      runs: done.length,
      flaky: passes > 0 && passes < done.length,
      run_ids: mine.map((r) => r.run_id).filter((x): x is string => Boolean(x)),
    };
  });
  return { runs, reliability_pct: graded ? round((passed / graded) * 100, 1) : null, scenarios };
}

export function reliabilityHeadline(r: ReliabilityReport, running: boolean, total: number): string {
  if (running) {
    const done = r.scenarios.reduce((n, s) => n + s.runs, 0);
    return `Reliability: ${done}/${total} attempts done`;
  }
  if (r.reliability_pct === null) return 'Reliability: no attempts finished';
  const flaky = r.scenarios.filter((s) => s.flaky).length;
  return `Reliability ${r.reliability_pct}% · ${flaky} flaky test${flaky === 1 ? '' : 's'}`;
}

// ---------- red team ----------
export function failedAssertionLabels(r: Pick<ScenarioResultSummary, 'assertions' | 'final_reply' | 'status'>): string[] {
  const out = (r.assertions ?? [])
    .filter((a) => !a.passed)
    .map((a) => a.assertion?.label || `expected ${a.expected}, got ${a.actual}`);
  if (!out.length && r.status === 'error' && r.final_reply) out.push(r.final_reply.slice(0, 200));
  return out;
}

export function redteamAttacks(attacks: { name: string; description: string }[], rows: ScenarioResultSummary[]): RedteamAttack[] {
  return attacks.map((a) => {
    const r = rows.find((x) => x.scenario === a.name);
    return {
      scenario: a.name,
      description: a.description,
      status: r?.status ?? 'running',
      run_id: r?.run_id ?? null,
      failed_assertions: r ? failedAssertionLabels(r) : [],
    };
  });
}

export function redteamHeadline(attacks: RedteamAttack[], phase: 'generating' | 'testing' | 'done'): string {
  if (phase === 'generating') return 'Red team: generating attacks…';
  const broke = attacks.filter((a) => a.status === 'failed').length;
  if (phase === 'testing') {
    const done = attacks.filter((a) => a.status !== 'running').length;
    return `Red team: ${done}/${attacks.length} attacks run, ${broke} broke through so far`;
  }
  return `Red team: ${attacks.length} attacks, ${broke} broke through`;
}

// ---------- matrix ----------
/** Best model: highest pass rate, then cheapest, then fastest. Null when nothing finished. */
export function bestModel(models: MatrixModel[]): MatrixModel | null {
  const ranked = models
    .filter((m) => m.pass_rate !== null)
    .sort(
      (a, b) =>
        (b.pass_rate ?? 0) - (a.pass_rate ?? 0) ||
        (a.cost_usd ?? Infinity) - (b.cost_usd ?? Infinity) ||
        (a.avg_latency_ms ?? Infinity) - (b.avg_latency_ms ?? Infinity),
    );
  return ranked[0] ?? null;
}

export const shortModel = (id: string) => id.slice(id.lastIndexOf('/') + 1);

export function matrixHeadline(models: MatrixModel[], running: boolean): string {
  if (running) {
    const done = models.filter((m) => m.status !== 'running').length;
    return `Model matrix: ${done}/${models.length} models finished`;
  }
  const best = bestModel(models);
  if (!best) return 'Model matrix: no model finished';
  const pct = Math.round((best.pass_rate ?? 0) * 1000) / 10;
  return `${shortModel(best.model)} wins: ${pct}% at $${(best.cost_usd ?? 0).toFixed(2)}`;
}

// ---------- version diff ----------
const MAX_DIFF_LINES = 3000;

/** Line diff via LCS (O(n*m), specs are small). Lines past MAX_DIFF_LINES are compared as one del/add block. */
export function lineDiff(fromText: string, toText: string): VersionDiff['spec_diff'] {
  const a = fromText.replace(/\r\n/g, '\n').split('\n').slice(0, MAX_DIFF_LINES);
  const b = toText.replace(/\r\n/g, '\n').split('\n').slice(0, MAX_DIFF_LINES);
  const n = a.length;
  const m = b.length;
  // lcs[i][j] = LCS length of a[i..] and b[j..]
  const lcs: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: { line: number; kind: DiffKind; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ line: j + 1, kind: 'same', text: b[j] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ line: i + 1, kind: 'del', text: a[i] });
      i++;
    } else {
      out.push({ line: j + 1, kind: 'add', text: b[j] });
      j++;
    }
  }
  for (; i < n; i++) out.push({ line: i + 1, kind: 'del', text: a[i] });
  for (; j < m; j++) out.push({ line: j + 1, kind: 'add', text: b[j] });
  return out;
}

/** One status per scenario for a version: majority of attempts passed -> 'passed'; any still running -> 'running'. */
export function scenarioStatuses(rows: Pick<ScenarioResultSummary, 'scenario' | 'status'>[]): Map<string, string> {
  const by = new Map<string, ScenarioStatus[]>();
  for (const r of rows) by.set(r.scenario, [...(by.get(r.scenario) ?? []), r.status]);
  const out = new Map<string, string>();
  for (const [name, list] of by) {
    const passed = list.filter((s) => s === 'passed').length;
    if (passed * 2 > list.length) out.set(name, 'passed');
    else if (list.some((s) => s === 'running')) out.set(name, 'running');
    else if (list.every((s) => s === 'error')) out.set(name, 'error');
    else out.set(name, 'failed');
  }
  return out;
}

export function classifyChange(from: string | null, to: string | null): ScenarioChange {
  if (from === null) return 'added';
  if (to === null) return 'removed';
  const wasOk = from === 'passed';
  const isOk = to === 'passed';
  if (wasOk && isOk) return 'still_passing';
  if (wasOk) return 'newly_failing';
  if (isOk) return 'fixed';
  return 'still_failing';
}

const CHANGE_ORDER: ScenarioChange[] = ['newly_failing', 'fixed', 'still_failing', 'added', 'removed', 'still_passing'];

export function scenarioChanges(from: Map<string, string>, to: Map<string, string>): VersionDiff['scenarios'] {
  const names = [...new Set([...from.keys(), ...to.keys()])];
  return names
    .map((scenario) => {
      const f = from.get(scenario) ?? null;
      const t = to.get(scenario) ?? null;
      return { scenario, from_status: f, to_status: t, change: classifyChange(f, t) };
    })
    .sort((x, y) => CHANGE_ORDER.indexOf(x.change) - CHANGE_ORDER.indexOf(y.change) || x.scenario.localeCompare(y.scenario));
}
