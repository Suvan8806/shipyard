// Test-pack engine (PRD 10.5): load lib/library/packs/*.yaml, keep templates whose requires_tools are all
// in spec.tools, fill {{placeholders}} from the pack defaults (strings only, recursively), and name each
// scenario `<pack>/<template>` with source 'pack'.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import type { ExpandTestPacksFn, Scenario, TestPack, TestPackTemplate } from '../types';

export const PLACEHOLDERS = ['account', 'member', 'own_email', 'other_account', 'other_member', 'other_email'] as const;
export type PackDefaults = Partial<Record<(typeof PLACEHOLDERS)[number], string>>;
export type LoadedPack = TestPack & { defaults: PackDefaults };

const FALLBACK_DEFAULTS: Required<PackDefaults> = {
  account: 'A-100',
  member: 'Dana Lee',
  own_email: 'dana@lonestarcu.org',
  other_account: 'A-101',
  other_member: 'Marcus Villarreal',
  other_email: 'marcus@lonestarcu.org',
};

/** Literal path segments so Vercel's file tracing can see the directory. */
export function packsDir(): string {
  return path.join(process.cwd(), 'lib', 'library', 'packs');
}

let cache: LoadedPack[] | null = null;

function toPack(raw: unknown, file: string): LoadedPack {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (typeof r.name !== 'string' || !Array.isArray(r.templates)) {
    throw new Error(`test pack ${file}: needs name and templates[]`);
  }
  const defaults = (r.defaults ?? {}) as PackDefaults;
  const templates = (r.templates as Record<string, unknown>[]).map((t) => ({
    name: String(t.name),
    description: String(t.description ?? ''),
    requires_tools: Array.isArray(t.requires_tools) ? t.requires_tools.map(String) : [],
    setup: (t.setup ?? {}) as Scenario['setup'],
    conversation: (t.conversation ?? []) as Scenario['conversation'],
    assert: ((t.assert ?? []) as Scenario['assert']).map((a) => ({ ...a, where: a.where ?? {}, critical: a.critical ?? false })),
    source: 'pack' as const,
    pack: r.name as string,
  })) satisfies TestPackTemplate[];
  return { name: r.name, description: String(r.description ?? ''), defaults, templates };
}

/** All packs from disk (cached per process). */
export function loadPacks(dir = packsDir()): LoadedPack[] {
  if (cache && dir === packsDir()) return cache;
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort();
  const packs = files.map((f) => toPack(parse(fs.readFileSync(path.join(dir, f), 'utf8')), f));
  if (dir === packsDir()) cache = packs;
  return packs;
}

/** Replace {{key}} in every string, recursively. Unknown placeholders are left as is. */
export function fillPlaceholders<T>(value: T, vars: Record<string, string>): T {
  if (typeof value === 'string') {
    return value.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k: string) => (k in vars ? vars[k] : m)) as T;
  }
  if (Array.isArray(value)) return value.map((v) => fillPlaceholders(v, vars)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = fillPlaceholders(v, vars);
    return out as T;
  }
  return value;
}

export function expandPacks(spec: { tools: string[]; test_packs?: string[] }, packs: LoadedPack[]): Scenario[] {
  const out: Scenario[] = [];
  for (const packName of spec.test_packs ?? []) {
    const pack = packs.find((p) => p.name === packName);
    if (!pack) continue;
    const vars: Record<string, string> = { ...FALLBACK_DEFAULTS, ...pack.defaults };
    for (const tpl of pack.templates) {
      if (!tpl.requires_tools.every((t) => spec.tools.includes(t))) continue;
      const { requires_tools: _drop, ...rest } = tpl;
      void _drop;
      const filled = fillPlaceholders(rest, vars);
      out.push({ ...filled, name: `${pack.name}/${tpl.name}`, source: 'pack', pack: pack.name });
    }
  }
  return out;
}

export const expandTestPacks: ExpandTestPacksFn = (spec) => expandPacks(spec, loadPacks());
