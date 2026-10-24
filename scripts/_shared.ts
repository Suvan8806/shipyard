/**
 * Shared helpers for the Lane E seed scripts (seed-agents, seed-history, reset-live, simulate-traffic).
 * - loads agents/<name>/spec.yaml + scenarios and agents/_org.yaml from disk
 * - SQL literal helpers so every seed can print idempotent SQL with `--sql`
 *   (the Supabase DB is not reachable from every laptop; the SQL is applied via the Supabase MCP / SQL editor)
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export const ROOT = path.resolve(__dirname, '..');
export const AGENTS_DIR = path.join(ROOT, 'agents');

// ---------- CLI ----------
export function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
export function flagValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : undefined;
}

/** Loads .env.local (if present) into process.env without overriding existing values. Never prints values. */
export function loadEnvLocal(): void {
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

// ---------- SQL literals ----------
/** Single-quoted SQL string literal (or NULL). */
export function lit(v: string | null | undefined): string {
  if (v === null || v === undefined) return 'null';
  return `'${String(v).replace(/'/g, "''")}'`;
}
/** Numeric literal (or NULL). */
export function num(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return 'null';
  return String(v);
}
/** jsonb literal (or NULL). */
export function jsonb(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  return `${lit(JSON.stringify(v))}::jsonb`;
}
/** timestamptz literal relative to now(), e.g. ago(3.5 * 24 * 60) minutes. */
export function agoMinutes(minutes: number): string {
  return `now() - interval '${Math.round(minutes)} minutes'`;
}

// ---------- Content ----------
export interface AgentSource {
  name: string;
  spec_yaml: string;
  scenarios: Record<string, string>;
  team: string | null;
  owner: string | null;
}

interface OrgFile {
  agents?: Record<string, { team?: string; owner?: string }>;
}

export function loadOrg(): OrgFile {
  const file = path.join(AGENTS_DIR, '_org.yaml');
  return (YAML.parse(fs.readFileSync(file, 'utf8')) as OrgFile) ?? {};
}

/** Every agents/<name>/ folder with a spec.yaml, sorted by name. */
export function loadAgents(): AgentSource[] {
  const org = loadOrg();
  const dirs = fs
    .readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && fs.existsSync(path.join(AGENTS_DIR, d.name, 'spec.yaml')))
    .map((d) => d.name)
    .sort();
  return dirs.map((dir) => {
    const spec_yaml = fs.readFileSync(path.join(AGENTS_DIR, dir, 'spec.yaml'), 'utf8').replace(/\r\n/g, '\n');
    const parsed = YAML.parse(spec_yaml) as { name?: string };
    const name = parsed?.name ?? dir;
    const scenDir = path.join(AGENTS_DIR, dir, 'scenarios');
    const scenarios: Record<string, string> = {};
    if (fs.existsSync(scenDir)) {
      for (const f of fs.readdirSync(scenDir).filter((f) => /\.ya?ml$/.test(f)).sort()) {
        scenarios[f] = fs.readFileSync(path.join(scenDir, f), 'utf8').replace(/\r\n/g, '\n');
      }
    }
    const o = org.agents?.[name] ?? {};
    return { name, spec_yaml, scenarios, team: o.team ?? null, owner: o.owner ?? null };
  });
}

export interface PersonaAccount {
  id: string;
  owner: string;
  email: string;
  balance: number;
  monthly_payment: number;
}
export function loadPersonaAccounts(): PersonaAccount[] {
  const p = YAML.parse(fs.readFileSync(path.join(AGENTS_DIR, '_personas.yaml'), 'utf8')) as { accounts: PersonaAccount[] };
  return p.accounts;
}

/** Wraps statements in a transaction for --sql output. */
export function txn(statements: string[]): string {
  return ['begin;', ...statements, 'commit;'].join('\n');
}
