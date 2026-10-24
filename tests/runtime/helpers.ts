// Test helpers: a PGlite-backed SystemDb with the sys schema, a scenario seeder and an in-memory runner repo.
import { PGlite } from '@electric-sql/pglite';
import { SYS_SCHEMA_SQL } from '../../lib/sysdb/schema';
import type { ScenarioSetup, SystemDb } from '../../lib/types';
import type { RunEventInput, RunnerRepo } from '../../lib/runtime/runner';

export interface TestDb extends SystemDb { close(): Promise<void> }

export async function pgliteDb(): Promise<TestDb> {
  const pg = await PGlite.create();
  await pg.exec(SYS_SCHEMA_SQL);
  return {
    kind: 'twin',
    async query<T>(sql: string, params: unknown[] = []) {
      return (await pg.query(sql, params)).rows as T[];
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
    close: () => pg.close(),
  };
}

export async function seed(db: SystemDb, setup: ScenarioSetup): Promise<void> {
  for (const [table, rows] of Object.entries(setup)) {
    for (const row of rows ?? []) {
      const { days_ago, ...cols } = row as Record<string, unknown>;
      const keys = Object.keys(cols);
      const vals = Object.values(cols);
      if (days_ago !== undefined) {
        keys.push('created_at');
        vals.push(new Date(Date.now() - Number(days_ago) * 86_400_000).toISOString());
      }
      const ph = keys.map((_, i) => `$${i + 1}`).join(', ');
      await db.query(`insert into sys.${table} (${keys.join(', ')}) values (${ph})`, vals);
    }
  }
}

export const DANA = { id: 'A-100', owner: 'Dana Lee', email: 'dana@lonestarcu.org', balance: 412, monthly_payment: 412 };

export function memoryRepo() {
  const events: (RunEventInput & { seq: number })[] = [];
  const runs: Record<string, unknown>[] = [];
  const repo: RunnerRepo = {
    async createRun(input) {
      const id = `run-${runs.length + 1}`;
      runs.push({ id, ...input });
      return { id };
    },
    async appendEvent(_runId, event) {
      events.push({ ...event, seq: events.length + 1 });
      return events.length;
    },
    async finishRun(id, result) {
      const r = runs.find((x) => x.id === id);
      if (r) Object.assign(r, result);
    },
  };
  return { repo, events, runs };
}
