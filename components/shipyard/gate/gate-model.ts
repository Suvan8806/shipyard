// Pure view-model helpers for the gate board: totals, grouping, ordering, tag codes.
import type { GateResult, ScenarioResultSummary, ScenarioSource } from '@/lib/types';

/** Fixed pack order from design/direction.md 7.1 E; unknown packs follow alphabetically. */
const PACK_ORDER = ['money-safety', 'security', 'compliance', 'escalation', 'read-only'];
const PACK_CODES: Record<string, string> = {
  'money-safety': 'MS',
  security: 'SE',
  compliance: 'CO',
  escalation: 'ES',
  'read-only': 'RO',
};

export interface Verdicts {
  reply: boolean | null;
  endState: boolean | null;
  /** Reply check passed but the data is wrong. The whole pitch in one boolean. */
  disagree: boolean;
}

export function verdicts(r: ScenarioResultSummary): Verdicts {
  if (r.status === 'running' || r.status === 'error') return { reply: r.reply_check?.passed ?? null, endState: null, disagree: false };
  const reply = r.reply_check ? r.reply_check.passed : null;
  const endState = r.assertions.every((a) => a.passed);
  return { reply, endState, disagree: r.status === 'failed' && reply === true && endState === false };
}

export function shortName(r: Pick<ScenarioResultSummary, 'scenario' | 'pack'>): string {
  return r.pack && r.scenario.startsWith(`${r.pack}/`) ? r.scenario.slice(r.pack.length + 1) : r.scenario;
}

/** Same naming convention as lib/platform/repo.ts#inferScenarioSource (pack/x, gen-x, else spec). */
function inferSource(name: string): { source: ScenarioSource; pack?: string } {
  const slash = name.indexOf('/');
  if (slash > 0) return { source: 'pack', pack: name.slice(0, slash) };
  if (name.startsWith('gen-')) return { source: 'generated' };
  return { source: 'spec' };
}

function placeholder(name: string): ScenarioResultSummary {
  return {
    scenario: name,
    attempt: 1,
    status: 'running',
    run_id: null,
    assertions: [],
    reply_check: null,
    final_reply: null,
    diff: null,
    ...inferSource(name),
  };
}

/**
 * Every tag the board should show. While running, scenarios that have no result row yet appear as running
 * placeholders. Once finished, only real result rows count (seeded history can list more names than results).
 */
export function boardResults(gate: GateResult): ScenarioResultSummary[] {
  if (gate.status !== 'running') return gate.results;
  const seen = new Set(gate.results.map((r) => r.scenario));
  const missing = (gate.scenario_names ?? []).filter((n) => !seen.has(n)).map(placeholder);
  return [...gate.results, ...missing];
}

export interface GateCounts {
  total: number;
  passed: number;
  failed: number;
  errored: number;
  running: number;
  done: number;
  criticalFailed: number;
  disagreements: number;
  packs: number;
}

export const isCriticalFail = (r: ScenarioResultSummary) =>
  r.status === 'failed' && r.assertions.some((a) => !a.passed && a.critical);

/**
 * The most telling failure: a reply-vs-data disagreement (the agent's own spec scenarios before packs), else the
 * first critical failure, else any failure.
 */
export function pickSpotlight(results: ScenarioResultSummary[]): ScenarioResultSummary | undefined {
  const failures = results.filter((r) => r.status === 'failed');
  const disagreements = failures.filter((r) => verdicts(r).disagree);
  return disagreements.find((r) => r.source === 'spec') ?? disagreements[0] ?? failures.find(isCriticalFail) ?? failures[0];
}

export function countResults(results: ScenarioResultSummary[]): GateCounts {
  const by = (s: ScenarioResultSummary['status']) => results.filter((r) => r.status === s).length;
  const running = by('running');
  return {
    total: results.length,
    passed: by('passed'),
    failed: by('failed'),
    errored: by('error'),
    running,
    done: results.length - running,
    criticalFailed: results.filter(isCriticalFail).length,
    disagreements: results.filter((r) => verdicts(r).disagree).length,
    packs: new Set(results.filter((r) => r.source === 'pack').map((r) => r.pack ?? 'pack')).size,
  };
}

export interface TagGroup {
  key: string;
  title: string;
  subtitle: string;
  code: string;
  results: ScenarioResultSummary[];
}

// Errors sink below passes: no verdict is less informative than a pass, and they must never bury the one FAIL.
const STATUS_RANK: Record<ScenarioResultSummary['status'], number> = { failed: 0, running: 1, passed: 2, error: 3 };

export function groupResults(results: ScenarioResultSummary[]): TagGroup[] {
  const sort = (rs: ScenarioResultSummary[]) =>
    [...rs].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.scenario.localeCompare(b.scenario));
  const packs = new Map<string, ScenarioResultSummary[]>();
  for (const r of results) {
    if (r.source !== 'pack') continue;
    const name = r.pack ?? 'pack';
    packs.set(name, [...(packs.get(name) ?? []), r]);
  }
  const packNames = [...packs.keys()].sort((a, b) => {
    const ia = PACK_ORDER.indexOf(a);
    const ib = PACK_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const groups: TagGroup[] = [];
  const spec = results.filter((r) => r.source === 'spec');
  if (spec.length) groups.push({ key: 'spec', title: 'Spec', subtitle: 'hand-written scenarios', code: 'SP', results: sort(spec) });
  for (const name of packNames) {
    groups.push({
      key: `pack:${name}`,
      title: name,
      subtitle: 'test pack',
      code: PACK_CODES[name] ?? name.slice(0, 2).toUpperCase(),
      results: sort(packs.get(name) ?? []),
    });
  }
  const gen = results.filter((r) => r.source === 'generated');
  if (gen.length) groups.push({ key: 'generated', title: 'Generated', subtitle: 'proposed by the model, accepted by a person', code: 'GN', results: sort(gen) });
  return groups;
}

/** Stable per-scenario code like MS-03, numbered by name order inside its group (not by status order). */
export function tagCodes(groups: TagGroup[]): Map<string, string> {
  const codes = new Map<string, string>();
  for (const g of groups) {
    const names = g.results.map((r) => r.scenario).sort((a, b) => a.localeCompare(b));
    names.forEach((n, i) => codes.set(n, `${g.code}-${String(i + 1).padStart(2, '0')}`));
  }
  return codes;
}
