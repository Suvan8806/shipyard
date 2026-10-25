// In-browser mock backend for the stress lab + version diff (NEXT_PUBLIC_USE_MOCKS). Only components/shipyard/api.ts
// imports this. Jobs live in module memory and play out over SIM_STRESS_MS so the running state is visible.
import {
  GATE_LIVE,
  LIVE_RUN_ID,
  STRESS_HISTORY,
  STRESS_MATRIX,
  STRESS_REDTEAM,
  STRESS_RELIABILITY,
  VERSION_DIFF_1_2,
} from '@/lib/mock/fixtures';
import { getAgent, MockError } from '../mock';
import type { StressRequest, StressResult, StressStarted, StressSummary, VersionDiff } from './contract';
import { estimateCost, shortModel } from './estimate';

/** How long a simulated stress job takes. */
export const SIM_STRESS_MS = 7000;
const MOCK_BUDGET_USD = 8;
let mockSpend = 2.41;

interface StressSim {
  startedAt: number;
  final: StressResult;
}
let sims: Record<string, StressSim> = {};
let seq = 0;

const clone = <T>(v: T): T => structuredClone(v);

export function getBudget(): { spend_usd: number | null; budget_usd: number } {
  return { spend_usd: Number(mockSpend.toFixed(4)), budget_usd: MOCK_BUDGET_USD };
}

function finalReliability(agent: string, runs: number): StressResult {
  const base = clone(STRESS_RELIABILITY);
  const scenarios = base.reliability.scenarios.map((s) => {
    const fails = s.runs - s.passes;
    const passes = fails > 0 ? Math.max(1, runs - fails) : runs;
    return {
      ...s,
      passes,
      runs,
      flaky: passes > 0 && passes < runs,
      run_ids: Array.from({ length: runs }, (_, i) => s.run_ids[i % s.run_ids.length]),
    };
  });
  const total = scenarios.length * runs;
  const pct = Math.round((scenarios.reduce((n, s) => n + s.passes, 0) / total) * 1000) / 10;
  const flaky = scenarios.filter((s) => s.flaky).length;
  return {
    ...base,
    agent,
    total_cost_usd: Number((total * 0.006).toFixed(4)),
    headline: `Reliability ${pct}% · ${flaky} flaky ${flaky === 1 ? 'test' : 'tests'}`,
    reliability: { runs, reliability_pct: pct, scenarios },
  };
}

function finalRedteam(agent: string, count: number): StressResult {
  const base = clone(STRESS_REDTEAM);
  const pool = base.redteam.attacks;
  const attacks = Array.from({ length: count }, (_, i) => {
    const a = pool[i % pool.length];
    const round = Math.floor(i / pool.length);
    if (round === 0) return { ...a };
    return { ...a, scenario: `${a.scenario}-v${round + 1}`, status: 'passed' as const, run_id: LIVE_RUN_ID, failed_assertions: [] };
  });
  const broke = attacks.filter((a) => a.status === 'failed').length;
  return {
    ...base,
    agent,
    total_cost_usd: Number((count * 0.006).toFixed(4)),
    headline: `Red team: ${count} attacks, ${broke} broke through`,
    redteam: { generated: count, broke_through: broke, attacks },
  };
}

function finalMatrix(agent: string, models: string[]): StressResult {
  const base = clone(STRESS_MATRIX);
  const known = new Map(base.matrix.models.map((m) => [m.model, m]));
  const rows = models.map((model, i) => {
    const hit = known.get(model);
    if (hit) return hit;
    const rate = Math.max(0.84, 1 - (i + 1) * 0.026);
    return {
      model,
      version: null,
      status: 'failed',
      pass_rate: rate,
      cost_usd: 0.12 + i * 0.03,
      avg_latency_ms: 1800 + i * 400,
      failed: ['second-credit-this-month'],
    };
  });
  const best = [...rows].sort((a, b) => (b.pass_rate ?? 0) - (a.pass_rate ?? 0) || (a.cost_usd ?? 0) - (b.cost_usd ?? 0))[0];
  return {
    ...base,
    agent,
    total_cost_usd: Number(rows.reduce((n, r) => n + (r.cost_usd ?? 0), 0).toFixed(4)),
    headline: `${shortModel(best.model)} wins: ${Math.round((best.pass_rate ?? 0) * 100)}% at $${(best.cost_usd ?? 0).toFixed(2)}`,
    matrix: { models: rows },
  };
}

/** The job as the API would report it `now`. */
function progress(sim: StressSim, now: number): StressResult {
  const f = sim.final;
  const elapsed = now - sim.startedAt;
  if (elapsed >= SIM_STRESS_MS) return { ...clone(f), status: 'done', finished_at: new Date(sim.startedAt + SIM_STRESS_MS).toISOString() };
  const p = Math.max(0, elapsed / SIM_STRESS_MS);
  const out: StressResult = { ...clone(f), status: 'running', finished_at: null, total_cost_usd: null, headline: 'Running…' };
  if (f.reliability) {
    const total = f.reliability.runs;
    const done = Math.min(total, Math.floor(p * (total + 0.6)));
    out.reliability = {
      runs: total,
      reliability_pct: null,
      scenarios: f.reliability.scenarios.map((s) => {
        const passes = Math.min(s.passes, done);
        return { ...s, runs: done, passes, flaky: passes > 0 && passes < done, run_ids: s.run_ids.slice(0, done) };
      }),
    };
    out.headline = `Run ${Math.min(total, done + 1)} of ${total}…`;
  }
  if (f.redteam) {
    const n = f.redteam.attacks.length;
    const done = Math.floor(p * n);
    const attacks = f.redteam.attacks.map((a, i) =>
      i < done ? a : { ...a, status: 'running' as const, run_id: null, failed_assertions: [] },
    );
    out.redteam = { generated: n, broke_through: attacks.filter((a) => a.status === 'failed').length, attacks };
    out.headline = `${done} of ${n} attacks graded…`;
  }
  if (f.matrix) {
    const n = f.matrix.models.length;
    out.matrix = {
      models: f.matrix.models.map((m, i) =>
        p >= (i + 1) / (n + 0.4) ? m : { ...m, status: 'running', pass_rate: null, cost_usd: null, avg_latency_ms: null, failed: [] },
      ),
    };
    out.headline = `Testing ${n} models…`;
  }
  return out;
}

function all(agent: string): StressResult[] {
  getAgent(agent); // throws not_found for unknown agents
  const seeded = agent === 'support-agent' ? STRESS_HISTORY.map(clone) : [];
  const live = Object.values(sims)
    .filter((s) => s.final.agent === agent)
    .map((s) => progress(s, Date.now()));
  return [...live, ...seeded].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export function listStress(agent: string): StressSummary[] {
  return all(agent).map(({ stress_id, mode, status, created_at, headline }) => ({ stress_id, mode, status, created_at, headline }));
}

export function getStress(agent: string, id: string): StressResult {
  const hit = all(agent).find((s) => s.stress_id === id);
  if (!hit) throw new MockError('not_found', `Stress run ${id} not found.`);
  return hit;
}

export function startStress(agent: string, req: StressRequest, tests: number): StressStarted {
  getAgent(agent);
  const estimate = estimateCost({ mode: req.mode, tests, runs: req.runs, count: req.count, models: req.models?.length });
  const left = MOCK_BUDGET_USD - mockSpend;
  if (estimate > left) {
    throw new MockError('budget_exceeded', `This needs about $${estimate.toFixed(2)} but only $${left.toFixed(2)} of the budget is left.`);
  }
  let final: StressResult;
  if (req.mode === 'reliability') final = finalReliability(agent, req.runs ?? 3);
  else if (req.mode === 'redteam') final = finalRedteam(agent, req.count ?? 30);
  else final = finalMatrix(agent, req.models ?? ['google/gemini-3.5-flash', 'google/gemini-3.5-flash-lite']);
  seq += 1;
  const stress_id = `st_mock_${seq}`;
  const created_at = new Date().toISOString();
  sims = { ...sims, [stress_id]: { startedAt: Date.now(), final: { ...final, stress_id, created_at } } };
  mockSpend += final.total_cost_usd ?? estimate;
  return { stress_id, status: 'running' };
}

const FLIP = { newly_failing: 'fixed', fixed: 'newly_failing', added: 'removed', removed: 'added' } as const;

export function getDiff(agent: string, from: number, to: number): VersionDiff {
  const d = getAgent(agent);
  for (const v of [from, to]) {
    if (!d.versions.some((x) => x.version === v)) throw new MockError('not_found', `${agent} has no version ${v}.`);
  }
  if (agent === 'support-agent' && from === 1 && to === 2) return clone(VERSION_DIFF_1_2);
  if (agent === 'support-agent' && from === 2 && to === 1) {
    return {
      from,
      to,
      spec_diff: VERSION_DIFF_1_2.spec_diff.map((l) => ({ ...l, kind: l.kind === 'add' ? 'del' : l.kind === 'del' ? 'add' : 'same' })),
      scenarios: VERSION_DIFF_1_2.scenarios.map((s) => ({
        scenario: s.scenario,
        from_status: s.to_status,
        to_status: s.from_status,
        change: s.change in FLIP ? FLIP[s.change as keyof typeof FLIP] : s.change,
      })),
    };
  }
  // Any other pair: the mock keeps no older specs, so it reports an unchanged spec and unchanged tests.
  const lines = d.draft_spec_yaml.replace(/\n$/, '').split('\n');
  return {
    from,
    to,
    spec_diff: lines.map((text, i) => ({ line: i + 1, kind: 'same' as const, text })),
    scenarios: GATE_LIVE.results.map((r) => ({ scenario: r.scenario, from_status: 'passed', to_status: 'passed', change: 'still_passing' as const })),
  };
}
