/**
 * Offline check for the seed SQL: `npx tsx scripts/check-seed-sql.ts`
 * Applies supabase/migrations/*.sql to an in-memory PGlite, then the --sql output of seed-agents, seed-history
 * (twice, to prove idempotency) and reset-live, and prints row counts. Exits 1 on any SQL error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { ROOT, txn } from './_shared';
import { accountsReconcileSql, agentUpsertSql } from './seed-agents';
import { buildBatches } from './seed-history';
import { loadAgents } from './_shared';
import { resetLiveStatements } from '../lib/library/reset';

async function counts(db: PGlite): Promise<Record<string, number>> {
  const tables = ['public.agents', 'public.agent_versions', 'public.runs', 'public.run_events', 'public.scenario_results',
    'public.audit_log', 'sys.accounts', 'sys.approvals'];
  const out: Record<string, number> = {};
  for (const t of tables) {
    const r = await db.query<{ n: number }>(`select count(*)::int as n from ${t}`);
    out[t] = r.rows[0].n;
  }
  return out;
}

async function main() {
  const db = await PGlite.create();
  try {
    await db.exec('create extension if not exists pgcrypto;').catch(() => undefined);
    const migDir = path.join(ROOT, 'supabase', 'migrations');
    for (const f of fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()) {
      await db.exec(fs.readFileSync(path.join(migDir, f), 'utf8'));
    }
    await db.exec(txn([...accountsReconcileSql(), ...loadAgents().map(agentUpsertSql)]));
    for (let pass = 1; pass <= 2; pass++) {
      for (const b of buildBatches()) await db.exec(txn(b.statements));
      console.log(`after seed-history pass ${pass}:`, await counts(db));
    }
    const v = await db.query(`select agent, version, status, pass_rate, total_cost_usd from public.agent_versions order by agent, version`);
    console.table(v.rows);
    const cur = await db.query(`select name, team, owner, current_version from public.agents order by name`);
    console.table(cur.rows);
    const bad = await db.query<{ n: number }>(`select count(*)::int as n from public.runs where id::text like '5e5e5e5e-%' and (ended_at is null or cost_usd = 0)`);
    if (bad.rows[0].n > 0) throw new Error(`${bad.rows[0].n} synthetic runs without events/cost`);
    await db.exec(txn(resetLiveStatements().map((s) => s + ';')));
    console.log('after reset-live:', await counts(db));
    const acc = await db.query<{ n: number }>(`select count(*)::int as n from sys.accounts where email like '%@lonestarcu.org'`);
    console.log('canonical accounts:', acc.rows[0].n);
    console.log('OK');
  } finally {
    await db.close();
  }
}

main().catch((e) => {
  console.error('check-seed-sql failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
