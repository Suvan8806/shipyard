// Spec helpers for services: validate via Lane A's validateSpec, and fall back to a loose YAML parse when the
// validator does not hand back the parsed spec/scenarios (the W0 stub does not).
import { createHash } from 'node:crypto';
import YAML from 'yaml';
import { validateSpec } from '../spec/validate';
import { expandTestPacks } from '../gate/packs';
import type { AgentSpec, Scenario, ValidationResult } from '../types';
import { ServiceError } from './errors';

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** Best-effort name from spec YAML (used before validation, e.g. to key the draft). */
export function specName(specYaml: string): string | null {
  try {
    const doc = YAML.parse(specYaml) as { name?: unknown } | null;
    if (doc && typeof doc.name === 'string' && /^[a-z0-9-]{2,40}$/.test(doc.name)) return doc.name;
  } catch {
    /* fall through to regex */
  }
  return /^name:\s*([a-z0-9-]{2,40})\s*$/m.exec(specYaml)?.[1] ?? null;
}

export function looseSpec(specYaml: string): AgentSpec {
  const d = (YAML.parse(specYaml) ?? {}) as Record<string, unknown>;
  const g = (d.gate ?? {}) as Record<string, unknown>;
  return {
    name: String(d.name ?? ''),
    goal: String(d.goal ?? '').trim(),
    profile: String(d.profile ?? 'fast'),
    inherit: asStrings(d.inherit),
    tools: asStrings(d.tools),
    instructions: String(d.instructions ?? ''),
    test_packs: asStrings(d.test_packs),
    gate: {
      min_pass_rate: typeof g.min_pass_rate === 'number' ? g.min_pass_rate : 1,
      runs_per_scenario: typeof g.runs_per_scenario === 'number' ? g.runs_per_scenario : 1,
      variants: typeof g.variants === 'number' ? g.variants : 0,
    },
  };
}

export function looseScenarios(record: Record<string, string>): Scenario[] {
  return Object.entries(record).map(([file, text]) => {
    const d = (YAML.parse(text) ?? {}) as Record<string, unknown>;
    const name = String(d.name ?? file.replace(/\.ya?ml$/, ''));
    return {
      name,
      description: String(d.description ?? ''),
      setup: (d.setup ?? {}) as Scenario['setup'],
      conversation: (Array.isArray(d.conversation) ? d.conversation : []) as Scenario['conversation'],
      assert: (Array.isArray(d.assert) ? d.assert : []).map((a) => ({
        where: {},
        critical: false,
        ...(a as object),
      })) as Scenario['assert'],
      source: name.startsWith('gen-') ? 'generated' : 'spec',
    };
  });
}

export function validate(specYaml: string, scenarios: Record<string, string>): ValidationResult {
  try {
    const r = validateSpec(specYaml, scenarios);
    return { ok: r.ok, errors: r.errors };
  } catch (e) {
    return { ok: false, errors: [{ path: 'spec', message: e instanceof Error ? e.message : String(e) }] };
  }
}

/** Validate and return the parsed spec + full scenario list (spec scenarios + test pack expansions). Throws 409 if invalid. */
export function compile(specYaml: string, scenarios: Record<string, string>): {
  spec: AgentSpec;
  scenarios: Scenario[];
  specHash: string;
} {
  let r: ReturnType<typeof validateSpec>;
  try {
    r = validateSpec(specYaml, scenarios);
  } catch (e) {
    throw new ServiceError('invalid_spec', e instanceof Error ? e.message : String(e));
  }
  if (!r.ok) throw new ServiceError('invalid_spec', 'spec is invalid; fix the errors and deploy again', r.errors);
  let spec: AgentSpec;
  let own: Scenario[];
  try {
    spec = r.spec ?? looseSpec(specYaml);
    own = r.scenarios ?? looseScenarios(scenarios);
  } catch (e) {
    throw new ServiceError('invalid_spec', `could not parse spec: ${e instanceof Error ? e.message : String(e)}`);
  }
  const ownNames = new Set(own.map((s) => s.name));
  const packs = expandTestPacks(spec).filter((s) => !ownNames.has(s.name));
  return { spec, scenarios: [...own, ...packs], specHash: specHash(specYaml, scenarios) };
}

export function specHash(specYaml: string, scenarios: Record<string, string>): string {
  const sorted = Object.keys(scenarios)
    .sort()
    .map((k) => [k, scenarios[k]]);
  return createHash('sha256').update(specYaml).update(JSON.stringify(sorted)).digest('hex');
}

/** Scenario -> YAML text (for generate-tests responses). */
export function scenarioToYaml(s: Scenario): string {
  const { source: _source, pack: _pack, ...rest } = s;
  void _source;
  void _pack;
  return YAML.stringify(rest, { lineWidth: 0 });
}
