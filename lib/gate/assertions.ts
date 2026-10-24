// Structured end-state assertions (PRD 10.2). Parameterized SQL only; every identifier is checked
// against the SYS_TABLES allowlist before it is quoted into a query.
import { isSysColumn, isSysTable, type SysTable } from '../sysdb/schema';
import type { Assertion, AssertionOutcome, EvaluateAssertionsFn, SystemDb } from '../types';

/** Lane A adds `reply_not_contains` to the contract in parallel; read it through this local type until merge. */
type AssertionX = Assertion & { reply_not_contains?: string };

const BODY_COLUMNS = ['body', 'details'] as const;

export class AssertionError extends Error {}

function describeWhere(a: AssertionX): string {
  const parts = Object.entries(a.where ?? {}).map(([k, v]) => `${k}=${v}`);
  if (a.body_contains !== undefined) parts.push(`text~"${a.body_contains}"`);
  return parts.length ? ` where ${parts.join(', ')}` : '';
}

function buildWhere(table: SysTable, a: AssertionX, params: unknown[]): string {
  const clauses: string[] = [];
  for (const [col, value] of Object.entries(a.where ?? {})) {
    if (!isSysColumn(table, col)) throw new AssertionError(`assertion: unknown column "${col}" on table "${table}"`);
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
      throw new AssertionError(`assertion: where.${col} must be a string, number or boolean`);
    }
    params.push(value);
    clauses.push(`"${col}" = $${params.length}`);
  }
  if (a.body_contains !== undefined) {
    const cols = BODY_COLUMNS.filter((c) => isSysColumn(table, c));
    if (!cols.length) throw new AssertionError(`assertion: body_contains is not supported on table "${table}"`);
    params.push(`%${String(a.body_contains).replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    clauses.push(`(${cols.map((c) => `coalesce("${c}", '') ilike $${params.length}`).join(' or ')})`);
  }
  return clauses.length ? ` where ${clauses.join(' and ')}` : '';
}

const COUNT_KEYS = ['count', 'count_gte', 'count_lte'] as const;
const SUM_KEYS = ['lte', 'gte', 'eq'] as const;

function compare(actual: number, op: 'eq' | 'lte' | 'gte', want: number): boolean {
  const eps = 1e-9;
  if (op === 'eq') return Math.abs(actual - want) < eps;
  if (op === 'lte') return actual <= want + eps;
  return actual >= want - eps;
}
const SYMBOL = { eq: '=', lte: '≤', gte: '≥' } as const;

async function evaluateOne(db: SystemDb, a: AssertionX, finalReply: string): Promise<AssertionOutcome> {
  const critical = Boolean(a.critical);
  const reply = finalReply ?? '';

  if (a.reply_contains !== undefined) {
    const passed = reply.toLowerCase().includes(String(a.reply_contains).toLowerCase());
    return { assertion: a, passed, critical, expected: `reply contains "${a.reply_contains}"`, actual: passed ? 'found' : 'not found' };
  }
  if (a.reply_not_contains !== undefined) {
    const found = reply.toLowerCase().includes(String(a.reply_not_contains).toLowerCase());
    return { assertion: a, passed: !found, critical, expected: `reply does not contain "${a.reply_not_contains}"`, actual: found ? 'found' : 'not found' };
  }

  if (!a.table) throw new AssertionError('assertion: needs a table (or reply_contains / reply_not_contains)');
  if (!isSysTable(a.table)) throw new AssertionError(`assertion: unknown table "${a.table}"`);
  const table = a.table;
  const params: unknown[] = [];
  const where = buildWhere(table, a, params);
  const subject = `${table}${describeWhere(a)}`;

  if (a.sum !== undefined) {
    if (!isSysColumn(table, a.sum)) throw new AssertionError(`assertion: unknown sum column "${a.sum}" on table "${table}"`);
    const op = SUM_KEYS.find((k) => typeof a[k] === 'number');
    if (!op) throw new AssertionError('assertion: sum needs one of lte, gte, eq');
    const rows = await db.query<{ v: unknown }>(`select coalesce(sum("${a.sum}"), 0)::float8 as v from sys."${table}"${where}`, params);
    const actual = Number(rows[0]?.v ?? 0);
    const want = Number(a[op]);
    return {
      assertion: a,
      passed: compare(actual, op, want),
      critical,
      expected: `${subject}: sum(${a.sum}) ${SYMBOL[op]} ${want}`,
      actual: String(actual),
    };
  }

  const key = COUNT_KEYS.find((k) => typeof a[k] === 'number');
  if (!key) throw new AssertionError('assertion: needs count, count_gte, count_lte or sum');
  const rows = await db.query<{ n: unknown }>(`select count(*)::int as n from sys."${table}"${where}`, params);
  const actual = Number(rows[0]?.n ?? 0);
  const want = Number(a[key]);
  const op = key === 'count' ? 'eq' : key === 'count_gte' ? 'gte' : 'lte';
  return {
    assertion: a,
    passed: compare(actual, op, want),
    critical,
    expected: `${subject}: count ${SYMBOL[op]} ${want}`,
    actual: String(actual),
  };
}

export const evaluateAssertions: EvaluateAssertionsFn = async (db, assertions, finalReply) => {
  const out: AssertionOutcome[] = [];
  for (const a of assertions ?? []) out.push(await evaluateOne(db, a as AssertionX, finalReply));
  return out;
};
