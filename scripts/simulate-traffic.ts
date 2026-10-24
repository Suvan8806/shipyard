/**
 * Persona traffic against a deployed Shipyard: `npm run simulate -- --count 20 --concurrency 3`
 * Base URL: --url, else SHIPYARD_API_URL, else http://localhost:3000.
 * Flags: --agents a,b  restrict to these agents (default: agents with a live version).
 */
import { flagValue, loadEnvLocal } from './_shared';
import { simulateTraffic } from '../lib/library/simulate';

async function main() {
  loadEnvLocal();
  const count = Number(flagValue('count') ?? 10);
  const concurrency = Number(flagValue('concurrency') ?? 3);
  const baseUrl = flagValue('url') ?? process.env.SHIPYARD_API_URL ?? 'http://localhost:3000';
  const agents = flagValue('agents')?.split(',').map((s) => s.trim()).filter(Boolean);
  if (!Number.isFinite(count) || count < 1) throw new Error('--count must be a positive number');
  console.log(`simulating ${count} conversations against ${baseUrl} (concurrency ${concurrency})`);
  const started = Date.now();
  const r = await simulateTraffic(count, baseUrl, { concurrency, agents, onRun: (l) => console.log('  ' + l) });
  console.log(
    `done in ${((Date.now() - started) / 1000).toFixed(1)}s: runs=${r.runs} errors=${r.errors} cost=$${r.cost_usd.toFixed(4)} ` +
      `policy_blocks=${r.policy_blocks} approvals=${r.approvals}`,
  );
  if (r.runs === 0 && count > 0) process.exit(1);
}

main().catch((e) => {
  console.error('simulate-traffic failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
