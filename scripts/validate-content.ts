/**
 * Standalone content validator: `npx tsx scripts/validate-content.ts`
 *
 * Parses every agents/<name>/spec.yaml, agents/<name>/scenarios/*.yaml and
 * lib/library/packs/*.yaml, checks tool names, blocks, profiles, tables, columns and the
 * one-check-per-assertion rule, then prints a summary. Exits 1 on any error.
 *
 * No app imports beyond the contracts (lib/types.ts, lib/sysdb/schema.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import type { Scenario } from '../lib/types';
import { SYS_TABLES, isSysTable, isSysColumn, type SysTable } from '../lib/sysdb/schema';

// ---------- Library facts (mirrors lib/library; keep in sync) ----------
const TOOLS = [
  'accounts.get',
  'accounts.find',
  'accounts.apply_credit',
  'payments.defer',
  'crm.add_note',
  'email.send',
  'approval.request',
] as const;
const BLOCK_NAMES = ['brand-tone', 'compliance', 'escalation'];
const PROFILES = ['fast', 'careful'];
const PLACEHOLDERS = ['account', 'member', 'own_email', 'other_account', 'other_member', 'other_email'];
const CHECK_KEYS = ['count', 'count_gte', 'count_lte', 'sum', 'reply_contains'] as const;
const COMPARATORS = ['lte', 'gte', 'eq'] as const;
const NUMERIC_COLUMNS: Partial<Record<SysTable, string[]>> = {
  accounts: ['balance', 'monthly_payment'],
  credits: ['amount', 'id'],
  deferrals: ['months', 'id'],
  crm_notes: ['id'],
  email_outbox: ['id'],
  approvals: ['id'],
};
const TEXT_BODY_TABLES: SysTable[] = ['crm_notes', 'email_outbox', 'approvals'];
const REQUIRED_SETUP_COLUMNS: Record<SysTable, string[]> = {
  accounts: ['id', 'owner', 'email', 'balance', 'monthly_payment'],
  credits: ['account_id', 'amount'],
  deferrals: ['account_id', 'months'],
  crm_notes: ['account_id', 'body'],
  email_outbox: ['to_addr', 'external'],
  approvals: ['type'],
};
const SUPPORT_CREDIT_LINE = 'A goodwill credit of up to $25 may be applied once per member per 30 days.';
const FILE_RE = /^[a-z0-9-]+\.ya?ml$/;
const ACCOUNT_RE = /A-1[01]\d|\{\{account\}\}/;

const ROOT = typeof __dirname !== 'undefined' ? path.resolve(__dirname, '..') : process.cwd();
const AGENTS_DIR = path.join(ROOT, 'agents');
const PACKS_DIR = path.join(ROOT, 'lib', 'library', 'packs');

// ---------- Schemas ----------
const Scalar = z.union([z.string(), z.number(), z.boolean()]);
const AssertionSchema = z.strictObject({
  table: z.string().optional(),
  where: z.record(z.string(), Scalar).default({}),
  body_contains: z.string().min(1).optional(),
  count: z.number().int().min(0).optional(),
  count_gte: z.number().int().min(0).optional(),
  count_lte: z.number().int().min(0).optional(),
  sum: z.string().optional(),
  lte: z.number().optional(),
  gte: z.number().optional(),
  eq: z.number().optional(),
  reply_contains: z.string().min(1).optional(),
  critical: z.boolean(),
  label: z.string().min(3),
});
type AssertionIn = z.infer<typeof AssertionSchema>;

const ScenarioSchema = z.strictObject({
  name: z.string().regex(/^[a-z0-9-]{2,60}$/),
  description: z.string().min(10),
  setup: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))).default({}),
  conversation: z.array(z.strictObject({ user: z.string().min(5) })).min(1),
  assert: z.array(AssertionSchema).min(1),
});

const SpecSchema = z.strictObject({
  name: z.string().regex(/^[a-z0-9-]{2,40}$/),
  goal: z.string().min(10),
  profile: z.string(),
  inherit: z.array(z.string()).default([]),
  tools: z.array(z.string()).min(1),
  instructions: z.string().default(''),
  test_packs: z.array(z.string()).default([]),
  gate: z
    .strictObject({
      min_pass_rate: z.number().min(0).max(1).default(1),
      runs_per_scenario: z.number().int().min(1).max(5).default(1),
      variants: z.number().int().min(0).max(5).optional(),
    })
    .default({ min_pass_rate: 1, runs_per_scenario: 1 }),
});
type SpecIn = z.infer<typeof SpecSchema>;

const TemplateSchema = z.strictObject({
  name: z.string().regex(/^[a-z0-9-]{2,60}$/),
  description: z.string().min(10),
  requires_tools: z.array(z.string()).min(1),
  setup: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))).default({}),
  conversation: z.array(z.strictObject({ user: z.string().min(5) })).min(1),
  assert: z.array(AssertionSchema).min(1),
});
const PackSchema = z.strictObject({
  name: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().min(10),
  defaults: z.record(z.string(), z.string()),
  templates: z.array(TemplateSchema).min(1),
});
type TemplateIn = z.infer<typeof TemplateSchema>;

// ---------- Reporting ----------
const errors: string[] = [];
const warnings: string[] = [];
const err = (where: string, msg: string): void => {
  errors.push(`${where}: ${msg}`);
};
const warn = (where: string, msg: string): void => {
  warnings.push(`${where}: ${msg}`);
};

function rel(p: string): string {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

function readYaml(file: string): unknown {
  try {
    return YAML.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    err(rel(file), `YAML parse error: ${(e as Error).message}`);
    return undefined;
  }
}

function zodIssues(where: string, e: z.ZodError): void {
  for (const issue of e.issues) err(where, `${issue.path.join('.') || '(root)'}: ${issue.message}`);
}

// ---------- Checks ----------
function checkSetup(where: string, setup: Record<string, Record<string, unknown>[]>): Set<string> {
  const accountIds = new Set<string>();
  for (const [table, rows] of Object.entries(setup)) {
    if (!isSysTable(table)) {
      err(where, `setup: unknown table "${table}"`);
      continue;
    }
    rows.forEach((row, i) => {
      for (const col of Object.keys(row)) {
        if (col === 'days_ago') {
          if (!isSysColumn(table, 'created_at')) err(where, `setup.${table}[${i}]: days_ago on a table without created_at`);
          if (typeof row[col] !== 'number') err(where, `setup.${table}[${i}]: days_ago must be a number`);
          continue;
        }
        if (!isSysColumn(table, col)) err(where, `setup.${table}[${i}]: unknown column "${col}"`);
      }
      for (const col of REQUIRED_SETUP_COLUMNS[table]) {
        if (row[col] === undefined) err(where, `setup.${table}[${i}]: missing required column "${col}"`);
      }
      if (table === 'accounts' && typeof row.id === 'string') accountIds.add(row.id);
    });
  }
  return accountIds;
}

function checkAssertion(where: string, a: AssertionIn, accountIds: Set<string>): void {
  const checks = CHECK_KEYS.filter((k) => a[k] !== undefined);
  if (checks.length !== 1) {
    err(where, `exactly one check required (${CHECK_KEYS.join('/')}), found ${checks.length ? checks.join('+') : 'none'}`);
    return;
  }
  const comps = COMPARATORS.filter((k) => a[k] !== undefined);
  const check = checks[0];

  if (check === 'reply_contains') {
    if (a.table) err(where, 'reply_contains must not have a table');
    if (Object.keys(a.where).length) err(where, 'reply_contains must not have where');
    if (a.body_contains) err(where, 'reply_contains must not have body_contains');
    if (comps.length) err(where, `${comps.join('/')} only valid with sum`);
    return;
  }
  if (!a.table) return err(where, `${check} requires a table`);
  if (!isSysTable(a.table)) return err(where, `unknown table "${a.table}"`);
  const table = a.table;

  for (const [col, val] of Object.entries(a.where)) {
    if (!isSysColumn(table, col)) err(where, `where: unknown column "${table}.${col}"`);
    if ((col === 'account_id' || (table === 'accounts' && col === 'id')) && typeof val === 'string') {
      if (!accountIds.has(val)) warn(where, `where ${col}=${val} is not an account seeded in setup`);
    }
  }
  if (a.body_contains && !TEXT_BODY_TABLES.includes(table)) {
    err(where, `body_contains is only valid on ${TEXT_BODY_TABLES.join(', ')}`);
  }
  if (check === 'sum') {
    if (!isSysColumn(table, a.sum!)) err(where, `sum: unknown column "${table}.${a.sum}"`);
    else if (!NUMERIC_COLUMNS[table]?.includes(a.sum!)) err(where, `sum: "${table}.${a.sum}" is not numeric`);
    if (comps.length !== 1) err(where, `sum needs exactly one of lte/gte/eq, found ${comps.length}`);
  } else if (comps.length) {
    err(where, `${comps.join('/')} only valid with sum`);
  }
}

function checkScenario(where: string, s: z.infer<typeof ScenarioSchema>, opts: { requireAccountMention: boolean }): void {
  const accountIds = checkSetup(where, s.setup);
  s.assert.forEach((a, i) => checkAssertion(`${where} assert[${i}]`, a, accountIds));
  if (!s.assert.some((a) => a.table)) err(where, 'needs at least one end-state (table) assertion');
  if (!s.assert.some((a) => a.critical)) err(where, 'needs at least one critical assertion');
  const text = s.conversation.map((t) => t.user).join(' ');
  if (opts.requireAccountMention && !ACCOUNT_RE.test(text)) {
    warn(where, 'conversation never states an account id (fine only for lookup-by-name tests)');
  }
}

// ---------- Packs ----------
interface PackInfo { name: string; templates: TemplateIn[] }

function fill(value: unknown, vars: Record<string, string>): unknown {
  if (typeof value === 'string') return value.replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m);
  if (Array.isArray(value)) return value.map((v) => fill(v, vars));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, vars)]));
  }
  return value;
}

function placeholdersIn(value: unknown, out: Set<string>): void {
  if (typeof value === 'string') for (const m of value.matchAll(/\{\{(\w+)\}\}/g)) out.add(m[1]);
  else if (Array.isArray(value)) value.forEach((v) => placeholdersIn(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => placeholdersIn(v, out));
}

function loadPacks(): PackInfo[] {
  const packs: PackInfo[] = [];
  if (!fs.existsSync(PACKS_DIR)) {
    err(rel(PACKS_DIR), 'packs directory missing');
    return packs;
  }
  for (const file of fs.readdirSync(PACKS_DIR).filter((f) => FILE_RE.test(f)).sort()) {
    const full = path.join(PACKS_DIR, file);
    const where = rel(full);
    const parsed = PackSchema.safeParse(readYaml(full));
    if (!parsed.success) {
      zodIssues(where, parsed.error);
      continue;
    }
    const pack = parsed.data;
    if (pack.name !== file.replace(/\.ya?ml$/, '')) err(where, `name "${pack.name}" must match the file name`);
    for (const k of Object.keys(pack.defaults)) if (!PLACEHOLDERS.includes(k)) err(where, `defaults: unknown placeholder "${k}"`);
    for (const k of PLACEHOLDERS) if (!(k in pack.defaults)) err(where, `defaults: missing placeholder "${k}"`);

    const seen = new Set<string>();
    for (const t of pack.templates) {
      const tw = `${where} [${t.name}]`;
      if (seen.has(t.name)) err(tw, 'duplicate template name');
      seen.add(t.name);
      for (const tool of t.requires_tools) if (!(TOOLS as readonly string[]).includes(tool)) err(tw, `requires_tools: unknown tool "${tool}"`);
      const used = new Set<string>();
      placeholdersIn(t, used);
      for (const p of used) if (!PLACEHOLDERS.includes(p)) err(tw, `unknown placeholder {{${p}}}`);

      const { requires_tools: _ignored, ...rest } = t;
      const filled = ScenarioSchema.safeParse(fill(rest, pack.defaults));
      if (!filled.success) {
        zodIssues(tw, filled.error);
        continue;
      }
      checkScenario(tw, filled.data, { requireAccountMention: true });
    }
    packs.push({ name: pack.name, templates: pack.templates });
  }
  return packs;
}

// ---------- Agents ----------
interface AgentInfo { name: string; spec: SpecIn; scenarios: Scenario[] }

function checkSpec(where: string, dir: string, spec: SpecIn, packNames: Set<string>, rawLines: number): void {
  if (spec.name !== dir) err(where, `name "${spec.name}" must match the folder "${dir}"`);
  if (!PROFILES.includes(spec.profile)) err(where, `unknown profile "${spec.profile}"`);
  for (const b of spec.inherit) if (!BLOCK_NAMES.includes(b)) err(where, `inherit: unknown block "${b}"`);
  for (const t of spec.tools) if (!(TOOLS as readonly string[]).includes(t)) err(where, `tools: unknown tool "${t}"`);
  if (new Set(spec.tools).size !== spec.tools.length) err(where, 'tools: duplicates');
  for (const p of spec.test_packs) if (!packNames.has(p)) err(where, `test_packs: unknown pack "${p}"`);
  if (rawLines > 20) warn(where, `spec is ${rawLines} lines (aim for <= 20)`);
  if (spec.name === 'support-agent') {
    if (!spec.instructions.split('\n').some((l) => l.trim() === SUPPORT_CREDIT_LINE)) {
      err(where, `instructions must contain the exact line "${SUPPORT_CREDIT_LINE}"`);
    }
    if (rawLines > 20) err(where, 'support-agent spec must be <= 20 lines');
  }
}

function loadAgents(packNames: Set<string>): AgentInfo[] {
  const agents: AgentInfo[] = [];
  const dirs = fs
    .readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort();

  for (const dir of dirs) {
    const specFile = path.join(AGENTS_DIR, dir, 'spec.yaml');
    const where = rel(specFile);
    if (!fs.existsSync(specFile)) {
      err(where, 'missing spec.yaml');
      continue;
    }
    const raw = fs.readFileSync(specFile, 'utf8');
    const parsed = SpecSchema.safeParse(readYaml(specFile));
    if (!parsed.success) {
      zodIssues(where, parsed.error);
      continue;
    }
    const spec = parsed.data;
    checkSpec(where, dir, spec, packNames, raw.trimEnd().split('\n').length);

    const scenDir = path.join(AGENTS_DIR, dir, 'scenarios');
    const files = fs.existsSync(scenDir) ? fs.readdirSync(scenDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml')).sort() : [];
    if (files.length === 0) err(where, 'at least one scenario is required');
    if (files.length > 20) err(where, `at most 20 scenarios allowed, found ${files.length}`);

    const scenarios: Scenario[] = [];
    for (const f of files) {
      const full = path.join(scenDir, f);
      const sw = rel(full);
      if (!FILE_RE.test(f)) err(sw, 'file name must match ^[a-z0-9-]+\\.ya?ml$');
      const s = ScenarioSchema.safeParse(readYaml(full));
      if (!s.success) {
        zodIssues(sw, s.error);
        continue;
      }
      if (s.data.name !== f.replace(/\.ya?ml$/, '')) err(sw, `name "${s.data.name}" must match the file name`);
      checkScenario(sw, s.data, { requireAccountMention: true });
      scenarios.push(s.data as Scenario);
    }
    agents.push({ name: dir, spec, scenarios });
  }
  return agents;
}

// ---------- Org + personas ----------
function checkOrgAndPersonas(agentNames: string[]): void {
  const orgFile = path.join(AGENTS_DIR, '_org.yaml');
  const org = readYaml(orgFile) as { teams?: { name: string }[]; agents?: Record<string, { team: string; owner: string }> } | undefined;
  if (org) {
    const teams = new Set((org.teams ?? []).map((t) => t.name));
    for (const a of agentNames) {
      const entry = org.agents?.[a];
      if (!entry) err(rel(orgFile), `agent "${a}" has no team mapping`);
      else if (!teams.has(entry.team)) err(rel(orgFile), `agent "${a}" maps to unknown team "${entry.team}"`);
    }
  }

  const pFile = path.join(AGENTS_DIR, '_personas.yaml');
  const p = readYaml(pFile) as
    | { accounts?: { id: string; owner: string }[]; personas?: { name: string; account_id: string; agents?: string[]; messages?: string[] }[] }
    | undefined;
  if (!p) return;
  const owners = new Map((p.accounts ?? []).map((a) => [a.id, a.owner]));
  if (owners.size !== 20) err(rel(pFile), `expected 20 accounts, found ${owners.size}`);
  if ((p.personas ?? []).length < 12) err(rel(pFile), `expected >= 12 personas, found ${(p.personas ?? []).length}`);
  for (const persona of p.personas ?? []) {
    const w = `${rel(pFile)} [${persona.name}]`;
    if (owners.get(persona.account_id) !== persona.name) err(w, `account ${persona.account_id} belongs to "${owners.get(persona.account_id)}"`);
    for (const a of persona.agents ?? []) if (!agentNames.includes(a)) err(w, `unknown agent "${a}"`);
    const msgs = persona.messages ?? [];
    if (msgs.length < 2 || msgs.length > 3) err(w, 'needs 2-3 messages');
    for (const m of msgs) if (!m.includes(persona.account_id)) warn(w, `message does not state ${persona.account_id}: "${m.slice(0, 40)}..."`);
  }
}

// ---------- Main ----------
function applicable(spec: SpecIn, packs: PackInfo[]): { pack: string; count: number }[] {
  return spec.test_packs.map((name) => {
    const pack = packs.find((p) => p.name === name);
    const count = pack ? pack.templates.filter((t) => t.requires_tools.every((tool) => spec.tools.includes(tool))).length : 0;
    return { pack: name, count };
  });
}

function main(): void {
  const packs = loadPacks();
  const agents = loadAgents(new Set(packs.map((p) => p.name)));
  checkOrgAndPersonas(agents.map((a) => a.name));

  const totalScenarios = agents.reduce((n, a) => n + a.scenarios.length, 0);
  const totalTemplates = packs.reduce((n, p) => n + p.templates.length, 0);

  console.log('\nAgents');
  for (const a of agents) {
    const fromPacks = applicable(a.spec, packs);
    const packTotal = fromPacks.reduce((n, p) => n + p.count, 0);
    const detail = fromPacks.map((p) => `${p.pack} ${p.count}`).join(', ');
    console.log(
      `  ${a.name.padEnd(22)} ${String(a.scenarios.length).padStart(2)} scenarios + ${String(packTotal).padStart(2)} pack tests = ${String(
        a.scenarios.length + packTotal,
      ).padStart(2)} tests  (${detail || 'no packs'})`,
    );
  }
  console.log('\nPacks');
  for (const p of packs) console.log(`  ${p.name.padEnd(14)} ${p.templates.length} templates`);

  console.log(
    `\nTotals: ${agents.length} agents, ${totalScenarios} agent scenarios, ${packs.length} packs, ${totalTemplates} templates`,
  );
  console.log(`Tables checked against schema: ${Object.keys(SYS_TABLES).join(', ')}`);

  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  WARN  ${w}`);
  }
  if (errors.length) {
    console.log(`\n${errors.length} error(s):`);
    for (const e of errors) console.log(`  ERROR ${e}`);
    process.exit(1);
  }
  console.log('\nOK');
}

main();
