// Scenario twins: one migrated PGlite base per warm function, clone() per twin (PRD 6, 9.1).
// B1 measured: first base ~1.3 s, each clone ~0.4 s and ~10 MB, versus ~220 MB per fresh instance.
import { PGlite, type PGliteInterface } from '@electric-sql/pglite';
import { SYS_SCHEMA_SQL, SYS_TABLE_NAMES, SYS_TABLES, isSysColumn, type SysTable } from '../sysdb/schema';
import type { CreateTwinFn, Row, ScenarioSetup, Snapshot, SystemDb, Twin } from '../types';

/** Numeric columns: PGlite returns them as strings, snapshots normalize them to numbers. */
const NUMERIC_COLUMNS: Partial<Record<SysTable, readonly string[]>> = {
  accounts: ['balance', 'monthly_payment'],
  credits: ['amount'],
};
/** Tables whose `id` is a serial: sequences are bumped after seeding explicit ids. */
const SERIAL_TABLES: SysTable[] = SYS_TABLE_NAMES.filter((t) => t !== 'accounts');

let basePromise: Promise<PGlite> | null = null;

async function createBase(): Promise<PGlite> {
  const base = await PGlite.create();
  await base.exec(SYS_SCHEMA_SQL);
  return base;
}

/** The migrated base instance for this process (created once, reused by every twin). */
export function getBase(): Promise<PGlite> {
  if (!basePromise) {
    basePromise = createBase().catch((err) => {
      basePromise = null;
      throw err;
    });
  }
  return basePromise;
}

/** BigInt -> number (count(*) is int8) so rows survive JSON.stringify. */
function plainRow(row: Record<string, unknown>): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[k] = typeof v === 'bigint' ? Number(v) : v;
  return out;
}

export function pgliteSystemDb(pg: PGliteInterface): SystemDb {
  return {
    kind: 'twin',
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
      const res = await pg.query<Record<string, unknown>>(sql, params ?? []);
      return res.rows.map(plainRow) as T[];
    },
    async exec(sql: string): Promise<void> {
      await pg.exec(sql);
    },
  };
}

function toParam(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && !(v instanceof Date)) return JSON.stringify(v);
  return v;
}

export async function seedDb(db: SystemDb, setup: ScenarioSetup): Promise<void> {
  for (const key of Object.keys(setup ?? {})) {
    if (!(SYS_TABLE_NAMES as string[]).includes(key)) throw new Error(`setup: unknown table "${key}"`);
  }
  for (const table of SYS_TABLE_NAMES) {
    const rows = setup?.[table];
    if (!rows?.length) continue;
    for (const row of rows) {
      const cols: string[] = [];
      const vals: string[] = [];
      const params: unknown[] = [];
      for (const [col, value] of Object.entries(row)) {
        if (col === 'days_ago') {
          if (!isSysColumn(table, 'created_at')) throw new Error(`setup.${table}: days_ago needs a created_at column`);
          const days = Number(value);
          if (!Number.isFinite(days)) throw new Error(`setup.${table}: days_ago must be a number`);
          params.push(days);
          cols.push('"created_at"');
          vals.push(`now() - make_interval(days => $${params.length}::int)`);
          continue;
        }
        if (!isSysColumn(table, col)) throw new Error(`setup.${table}: unknown column "${col}"`);
        params.push(toParam(value));
        cols.push(`"${col}"`);
        vals.push(`$${params.length}`);
      }
      await db.query(`insert into sys."${table}" (${cols.join(', ')}) values (${vals.join(', ')})`, params);
    }
    if (SERIAL_TABLES.includes(table)) {
      await db.query(
        `select setval(pg_get_serial_sequence('sys."${table}"', 'id'), coalesce((select max(id) from sys."${table}"), 0) + 1, false)`,
      );
    }
  }
}

function normalizeValue(table: SysTable, col: string, v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return Number(v);
  if (v !== null && NUMERIC_COLUMNS[table]?.includes(col)) return Number(v);
  return v;
}

export async function snapshotDb(db: SystemDb): Promise<Snapshot> {
  const snap = {} as Snapshot;
  for (const table of SYS_TABLE_NAMES) {
    const rows = await db.query(`select * from sys."${table}" order by id`);
    snap[table] = rows.map((r) => {
      const out: Row = {};
      for (const col of SYS_TABLES[table]) out[col] = normalizeValue(table, col, r[col]);
      return out;
    });
  }
  return snap;
}

let counter = 0;

export const createTwin: CreateTwinFn = async () => {
  const base = await getBase();
  const pg = await base.clone();
  const db = pgliteSystemDb(pg);
  let closed = false;
  const twin: Twin = {
    id: `twin-${Date.now().toString(36)}-${(++counter).toString(36)}`,
    db,
    seed: (setup) => seedDb(db, setup),
    snapshot: () => snapshotDb(db),
    async close() {
      if (closed) return;
      closed = true;
      await pg.close();
    },
  };
  return twin;
};

/** Close the shared base (tests and scripts call this so Node can exit). */
export async function closeBase(): Promise<void> {
  if (!basePromise) return;
  const p = basePromise;
  basePromise = null;
  await (await p).close();
}
