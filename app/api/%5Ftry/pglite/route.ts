// TEMPORARY (Lane B, B1): prove PGlite base + clone() and pack bundling on a Vercel function. Delete before merge.
import { connection } from 'next/server';
import { createTwin, getBase } from '@/lib/twins/twin';
import { diffSnapshots } from '@/lib/twins/diff';
import { expandTestPacks, loadPacks } from '@/lib/gate/packs';

export const maxDuration = 120;
const bootedAt = Date.now();
let hits = 0;

export async function GET(req: Request) {
  const rounds = Math.min(Number(new URL(req.url).searchParams.get("rounds") ?? 1) || 1, 15);
  await connection();
  hits += 1;
  const mb = () => Math.round(process.memoryUsage().rss / 1e6);
  const timings: Record<string, number | string> = { hit: hits, instance_age_ms: Date.now() - bootedAt };
  try {
    let t = performance.now();
    await getBase();
    timings.base_ms = Math.round(performance.now() - t);
    timings.rss_after_base = mb();

    const perRound: string[] = [];
    let diffs: number[] = [];
    for (let round = 0; round < rounds; round++) {
    t = performance.now();
    const twins = await Promise.all([1, 2, 3, 4].map(() => createTwin()));
    timings.clone4_ms = Math.round(performance.now() - t);
    timings.rss_after_clone4 = mb();

    t = performance.now();
    diffs = await Promise.all(
      twins.map(async (tw) => {
        await tw.seed({
          accounts: [{ id: 'A-100', owner: 'Dana Lee', email: 'dana@lonestarcu.org', balance: 412, monthly_payment: 412 }],
          credits: [{ account_id: 'A-100', amount: 25, reason: 'goodwill', days_ago: 6 }],
        });
        const before = await tw.snapshot();
        await tw.db.query('insert into sys.credits (account_id, amount, reason) values ($1, $2, $3)', ['A-100', 25, 'x']);
        const d = diffSnapshots(before, await tw.snapshot());
        await tw.close();
        return d.credits?.added.length ?? 0;
      }),
    );
    timings.work4_ms = Math.round(performance.now() - t);
    perRound.push(`${timings.clone4_ms}ms/${mb()}MB`);
    }
    timings.rounds = perRound.join(' ');

    let packs: unknown;
    try {
      const loaded = loadPacks();
      const support = expandTestPacks({
        name: 'support-agent', goal: '', profile: 'fast', inherit: [], instructions: '',
        tools: ['accounts.get', 'accounts.apply_credit', 'payments.defer', 'crm.add_note', 'approval.request', 'email.send'],
        test_packs: ['security', 'compliance', 'money-safety', 'read-only', 'escalation'],
        gate: { min_pass_rate: 1, runs_per_scenario: 1, variants: 0 },
      });
      packs = { packs: loaded.map((p) => `${p.name}:${p.templates.length}`), support_expanded: support.length };
    } catch (e) {
      packs = { error: String(e) };
    }
    return Response.json({ ok: true, timings, diffs, packs });
  } catch (e) {
    return Response.json({ ok: false, timings, error: String(e), stack: (e as Error).stack }, { status: 500 });
  }
}
