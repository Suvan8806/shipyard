/**
 * Reset the live system before a demo walk: `npm run reset-live` (needs SUPABASE_DB_URL)
 * or `npx tsx scripts/reset-live.ts --sql` to print the SQL instead (apply via Supabase SQL editor / MCP).
 * Flags: --no-approvals  skip re-adding the 2 demo pending approvals.
 */
import { hasFlag, loadEnvLocal, txn } from './_shared';
import { resetLive, resetLiveStatements } from '../lib/library/reset';

async function main() {
  const keepDemoApprovals = !hasFlag('no-approvals');
  if (hasFlag('sql')) {
    console.log(txn(resetLiveStatements({ keepDemoApprovals }).map((s) => s + ';')));
    return;
  }
  loadEnvLocal();
  const { closeSql } = await import('../lib/db');
  try {
    await resetLive({ keepDemoApprovals });
    console.log('reset-live: ok (sys tables cleared, 20 accounts restored, support-agent draft = good spec)');
  } finally {
    await closeSql();
  }
}

main().catch((e) => {
  console.error('reset-live failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
