// Offline-first validation for `shipyard validate --file`: never touches the server draft.
// YAML + schema checks reuse lib/spec/parse.ts (pure zod); library references (tools, profiles, blocks, packs)
// are checked against GET /api/library so the CLI agrees with the server without importing server-only code.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { z } from 'zod';
import type { LibraryResponse } from '../../lib/contracts/api';
import { AgentSpecSchema, ScenarioSchema } from '../../lib/spec/parse';
import { SYS_TABLES, isSysColumn, isSysTable } from '../../lib/sysdb/schema';
import type { ValidationError, ValidationResult } from '../../lib/types';

function parseYaml(text: string, p: string): { value?: unknown; error?: ValidationError } {
  const lineCounter = new YAML.LineCounter();
  const doc = YAML.parseDocument(text, { prettyErrors: false, lineCounter });
  if (doc.errors.length > 0) {
    const e = doc.errors[0];
    const line = e.linePos?.[0]?.line ?? (e.pos ? lineCounter.linePos(e.pos[0]).line : undefined);
    return { error: { path: p, message: `invalid YAML${line ? ` at line ${line}` : ''}: ${e.message.split('\n')[0]}` } };
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

export function readScenarioDir(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fs.readdirSync(dir).sort()) {
    if (/\.ya?ml$/.test(f)) out[f] = fs.readFileSync(path.join(dir, f), 'utf8');
  }
  return out;
}

export function validateLocal(
  specYaml: string,
  scenarios: Record<string, string> | null,
  library: LibraryResponse | null,
  expectedName?: string,
): ValidationResult {
  const errors: ValidationError[] = [];
  const { value, error } = parseYaml(specYaml, 'spec');
  if (error) errors.push(error);
  else {
    const parsed = AgentSpecSchema.safeParse(value);
    if (!parsed.success) errors.push(...zodErrors(parsed.error, 'spec'));
    else {
      const spec = parsed.data;
      if (expectedName && spec.name !== expectedName) errors.push({ path: 'spec.name', message: `spec name "${spec.name}" does not match agent "${expectedName}"` });
      if (library) {
        const tools = library.tools.map((t) => t.name);
        const blocks = library.blocks.map((b) => b.name);
        const packs = library.packs.map((p) => p.name);
        if (!library.profiles[spec.profile]) errors.push({ path: 'spec.profile', message: `unknown profile "${spec.profile}"; use one of ${Object.keys(library.profiles).join(', ')}` });
        spec.tools.forEach((t, i) => {
          if (!tools.includes(t)) errors.push({ path: `spec.tools[${i}]`, message: `unknown tool "${t}"` });
        });
        spec.inherit.forEach((b, i) => {
          if (!blocks.includes(b)) errors.push({ path: `spec.inherit[${i}]`, message: `unknown block "${b}"` });
        });
        spec.test_packs.forEach((p, i) => {
          if (packs.length && !packs.includes(p)) errors.push({ path: `spec.test_packs[${i}]`, message: `unknown test pack "${p}"; use one of ${packs.join(', ')}` });
        });
      }
    }
  }
  if (scenarios) {
    const seen = new Set<string>();
    for (const [file, text] of Object.entries(scenarios)) {
      const prefix = `scenarios/${file}`;
      const r = parseYaml(text, prefix);
      if (r.error) {
        errors.push(r.error);
        continue;
      }
      const parsed = ScenarioSchema.safeParse(r.value);
      if (!parsed.success) {
        errors.push(...zodErrors(parsed.error, prefix));
        continue;
      }
      const s = parsed.data;
      if (seen.has(s.name)) errors.push({ path: `${prefix}.name`, message: `duplicate scenario name "${s.name}"` });
      seen.add(s.name);
      for (const [table, rows] of Object.entries(s.setup)) {
        if (!isSysTable(table)) {
          errors.push({ path: `${prefix}.setup.${table}`, message: `unknown table "${table}"; use one of ${Object.keys(SYS_TABLES).join(', ')}` });
          continue;
        }
        rows.forEach((row, i) => {
          for (const col of Object.keys(row)) {
            if (col !== 'days_ago' && !isSysColumn(table, col)) errors.push({ path: `${prefix}.setup.${table}[${i}].${col}`, message: `unknown column "${col}" in ${table}` });
          }
        });
      }
      s.assert.forEach((a, i) => {
        if (a.table && !isSysTable(a.table)) errors.push({ path: `${prefix}.assert[${i}].table`, message: `unknown table "${a.table}"` });
      });
    }
  }
  return { ok: errors.length === 0, errors };
}
