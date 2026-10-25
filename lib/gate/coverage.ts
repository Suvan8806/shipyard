// Coverage report (PRD 10.5 #4): tools and policies exercised by at least one test, tables checked by assertions.
import { POLICIES } from '../library';
import type { AgentSpec, GateCoverage, RunEvent, Scenario } from '../types';

export function sourceKey(s: Pick<Scenario, 'source' | 'pack'>): string {
  return s.source === 'pack' ? `pack:${s.pack ?? 'unknown'}` : s.source;
}

/**
 * @param events run events of every scenario attempt (tool_call / policy_block / approval names are tool names)
 */
export function computeCoverage(spec: AgentSpec, scenarios: Scenario[], events: RunEvent[]): GateCoverage {
  const touched = new Set<string>();
  const policies = new Set<string>();
  for (const e of events) {
    if (!e.name) continue;
    if (e.type === 'tool_call' || e.type === 'policy_block' || e.type === 'approval') touched.add(e.name);
    if (e.type === 'policy_block' || e.type === 'approval') policies.add(e.name);
  }
  // A tool with a policy that was called also exercised its policy check.
  for (const t of touched) if (POLICIES[t]) policies.add(t);

  const tables = new Set<string>();
  const bySource: Record<string, number> = {};
  for (const s of scenarios) {
    for (const a of s.assert) if (a.table) tables.add(a.table);
    const k = sourceKey(s);
    bySource[k] = (bySource[k] ?? 0) + 1;
  }
  const tools = spec.tools ?? [];
  return {
    tools_tested: tools.filter((t) => touched.has(t)),
    tools_untested: tools.filter((t) => !touched.has(t)),
    policies_tested: [...policies].filter((p) => tools.includes(p)).sort(),
    tables_checked: [...tables].sort(),
    total_tests: scenarios.length,
    by_source: bySource,
  };
}

/** `<name>~v<i>` paraphrase variants share their base scenario's assertions. */
export const baseScenarioName = (name: string) => name.replace(/~v\d+$/, '');

/**
 * The scenario list behind a gate's names (for coverage on read): each name resolves to its definition (or its
 * variant's base), else to `stub(name)` (a deleted or pack scenario we can no longer load).
 */
export function scenariosForNames(known: Scenario[], names: string[], stub: (name: string) => Scenario): Scenario[] {
  const byName = new Map(known.map((s) => [s.name, s]));
  return names.map((name) => {
    const def = byName.get(name) ?? byName.get(baseScenarioName(name));
    return def ? { ...def, name } : stub(name);
  });
}
