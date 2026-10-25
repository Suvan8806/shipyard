// validateSpec (PRD 7): parses the spec YAML + scenario YAMLs and checks them against the library.
// Every problem becomes a {path, message}; YAML syntax errors report the line number.
import YAML from 'yaml';
import type { z } from 'zod';
import type { AgentSpec, Scenario, ValidateSpecFn, ValidationError } from '../types';
import { SYS_TABLES, isSysColumn, isSysTable, type SysTable } from '../sysdb/schema';
import { BLOCKS, POLICIES, PROFILES, toolNames } from '../library';
import { PACKS } from '../library/packs-loader';
import { AgentSpecSchema, ScenarioSchema, type ScenarioIn } from './parse';

const BODY_COLUMN: Partial<Record<SysTable, string>> = { crm_notes: 'body', email_outbox: 'body', approvals: 'details' };

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

function didYouMean(value: string, options: readonly string[]): string {
  let best: string | null = null;
  let bestD = Infinity;
  for (const o of options) {
    const d = levenshtein(value, o);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best && bestD <= Math.max(2, Math.floor(value.length / 3)) ? ` (did you mean "${best}"?)` : '';
}

/** Parses YAML; returns the value or a ValidationError with the line number. */
export function parseYaml(text: string, path: string): { value?: unknown; error?: ValidationError } {
  const lineCounter = new YAML.LineCounter();
  const doc = YAML.parseDocument(text, { prettyErrors: false, lineCounter });
  if (doc.errors.length > 0) {
    const e = doc.errors[0];
    const line = e.linePos?.[0]?.line ?? (e.pos ? lineCounter.linePos(e.pos[0]).line : undefined);
    const msg = e.message.split('\n')[0];
    return { error: { path, message: `invalid YAML${line ? ` at line ${line}` : ''}: ${msg}` } };
  }
  return { value: doc.toJS() };
}

function zodErrors(err: z.ZodError, prefix: string): ValidationError[] {
  return err.issues.map((i) => {
    let p = prefix;
    for (const seg of i.path) p += typeof seg === 'number' ? `[${seg}]` : `.${String(seg)}`;
    return { path: p, message: i.message };
  });
}

function checkScenarioRefs(s: ScenarioIn, prefix: string): ValidationError[] {
  const errs: ValidationError[] = [];
  const tableNames = Object.keys(SYS_TABLES);
  for (const [table, rows] of Object.entries(s.setup)) {
    if (!isSysTable(table)) {
      errs.push({ path: `${prefix}.setup.${table}`, message: `unknown table "${table}"${didYouMean(table, tableNames)}` });
      continue;
    }
    rows.forEach((row, i) => {
      for (const col of Object.keys(row)) {
        if (col === 'days_ago' || isSysColumn(table, col)) continue;
        errs.push({
          path: `${prefix}.setup.${table}[${i}].${col}`,
          message: `unknown column "${col}" in ${table}${didYouMean(col, SYS_TABLES[table])}`,
        });
      }
    });
  }
  s.assert.forEach((a, i) => {
    const p = `${prefix}.assert[${i}]`;
    if (!a.table) return;
    if (!isSysTable(a.table)) {
      errs.push({ path: `${p}.table`, message: `unknown table "${a.table}"${didYouMean(a.table, tableNames)}` });
      return;
    }
    const table = a.table;
    for (const col of Object.keys(a.where)) {
      if (!isSysColumn(table, col)) {
        errs.push({ path: `${p}.where.${col}`, message: `unknown column "${col}" in ${table}${didYouMean(col, SYS_TABLES[table])}` });
      }
    }
    if (a.sum !== undefined && !isSysColumn(table, a.sum)) {
      errs.push({ path: `${p}.sum`, message: `unknown column "${a.sum}" in ${table}${didYouMean(a.sum, SYS_TABLES[table])}` });
    }
    if (a.body_contains !== undefined && !BODY_COLUMN[table]) {
      errs.push({ path: `${p}.body_contains`, message: `body_contains only works on ${Object.keys(BODY_COLUMN).join(', ')}` });
    }
  });
  return errs;
}

/** Validates one parsed scenario object (also used by the scenario generator). */
export function validateScenarioObject(
  raw: unknown,
  prefix: string,
): { scenario?: Scenario; errors: ValidationError[] } {
  const parsed = ScenarioSchema.safeParse(raw);
  if (!parsed.success) return { errors: zodErrors(parsed.error, prefix) };
  const errors = checkScenarioRefs(parsed.data, prefix);
  if (errors.length) return { errors };
  const s = parsed.data;
  const source = s.name.startsWith('gen-') ? 'generated' : s.name.includes('/') ? 'pack' : (s.source ?? 'spec');
  const scenario: Scenario = {
    name: s.name,
    description: s.description,
    setup: s.setup as Scenario['setup'],
    conversation: s.conversation,
    assert: s.assert as Scenario['assert'],
    source,
  };
  return { scenario, errors: [] };
}

function checkSpecRefs(spec: AgentSpec): ValidationError[] {
  const errs: ValidationError[] = [];
  const profiles = Object.keys(PROFILES);
  if (!PROFILES[spec.profile]) {
    errs.push({ path: 'profile', message: `unknown profile "${spec.profile}"${didYouMean(spec.profile, profiles)}; use one of ${profiles.join(', ')}` });
  }
  const blockNames = BLOCKS.map((b) => b.name);
  spec.inherit.forEach((b, i) => {
    if (!blockNames.includes(b)) errs.push({ path: `inherit[${i}]`, message: `unknown block "${b}"${didYouMean(b, blockNames)}` });
  });
  const tools = toolNames();
  spec.tools.forEach((t, i) => {
    if (!tools.includes(t)) {
      errs.push({ path: `tools[${i}]`, message: `unknown tool "${t}"${didYouMean(t, tools)}` });
      return;
    }
    const allowed = POLICIES[t]?.allowedAgents;
    if (allowed && !allowed.includes(spec.name)) {
      errs.push({ path: `tools[${i}]`, message: `agent "${spec.name}" is not allowed to use "${t}" (policy allowedAgents)` });
    }
  });
  const dupes = spec.tools.filter((t, i) => spec.tools.indexOf(t) !== i);
  if (dupes.length) errs.push({ path: 'tools', message: `duplicate tools: ${[...new Set(dupes)].join(', ')}` });
  const packNames = PACKS.map((p) => p.name);
  spec.test_packs.forEach((p, i) => {
    if (packNames.length && !packNames.includes(p)) {
      errs.push({ path: `test_packs[${i}]`, message: `unknown test pack "${p}"${didYouMean(p, packNames)}` });
    }
  });
  return errs;
}

export const validateSpec: ValidateSpecFn = (specYaml, scenarios) => {
  const errors: ValidationError[] = [];
  let spec: AgentSpec | undefined;

  if (!specYaml.trim()) {
    errors.push({ path: 'spec', message: 'spec is empty' });
  } else {
    const { value, error } = parseYaml(specYaml, 'spec');
    if (error) errors.push(error);
    else if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push({ path: 'spec', message: 'spec must be a YAML mapping (name, goal, profile, tools, ...)' });
    } else {
      // zod strips unknown keys, so a typo like `inherits:` would silently drop the shared blocks. Reject it instead.
      const known = Object.keys(AgentSpecSchema.shape);
      for (const key of Object.keys(value)) {
        if (!known.includes(key)) {
          errors.push({ path: `spec.${key}`, message: `unknown field "${key}"${didYouMean(key, known)}; allowed: ${known.join(', ')}` });
        }
      }
      const parsed = AgentSpecSchema.safeParse(value);
      if (!parsed.success) errors.push(...zodErrors(parsed.error, 'spec'));
      else {
        spec = parsed.data;
        errors.push(...checkSpecRefs(spec));
      }
    }
  }

  const out: Scenario[] = [];
  const files = Object.keys(scenarios);
  if (files.length === 0) errors.push({ path: 'scenarios', message: 'at least one scenario is required' });
  const seen = new Set<string>();
  for (const file of files) {
    const prefix = `scenarios/${file}`;
    const { value, error } = parseYaml(scenarios[file], prefix);
    if (error) {
      errors.push(error);
      continue;
    }
    const res = validateScenarioObject(value, prefix);
    errors.push(...res.errors);
    if (res.scenario) {
      if (seen.has(res.scenario.name)) errors.push({ path: `${prefix}.name`, message: `duplicate scenario name "${res.scenario.name}"` });
      seen.add(res.scenario.name);
      out.push(res.scenario);
    }
  }

  return { ok: errors.length === 0, errors, spec, scenarios: out };
};
