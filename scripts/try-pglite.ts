// B1 local probe: base PGlite + clone() per twin, timings and memory. Run: npx tsx scripts/try-pglite.ts
import { closeBase, createTwin, getBase } from '../lib/twins/twin';
import { diffSnapshots } from '../lib/twins/diff';

const mb = () => Math.round(process.memoryUsage().rss / 1e6);

async function main() {
  let t = performance.now();
  await getBase();
  console.log(`base create+migrate: ${Math.round(performance.now() - t)} ms, rss ${mb()} MB`);

  t = performance.now();
  const twins = await Promise.all([1, 2, 3, 4].map(() => createTwin()));
  console.log(`4 clones concurrently: ${Math.round(performance.now() - t)} ms, rss ${mb()} MB`);

  t = performance.now();
  await Promise.all(
    twins.map(async (tw, i) => {
      await tw.seed({
        accounts: [{ id: 'A-100', owner: 'Dana Lee', email: 'dana@lonestarcu.org', balance: 412, monthly_payment: 412 }],
        credits: [{ account_id: 'A-100', amount: 25, reason: 'late fee goodwill', days_ago: 6 }],
      });
      const before = await tw.snapshot();
      await tw.db.query('insert into sys.credits (account_id, amount, reason) values ($1, $2, $3)', ['A-100', 25 + i, 'x']);
      const after = await tw.snapshot();
      const d = diffSnapshots(before, after);
      if (i === 0) console.log('diff[0]:', JSON.stringify(d));
    }),
  );
  console.log(`seed+snapshot+insert+diff x4: ${Math.round(performance.now() - t)} ms, rss ${mb()} MB`);

  t = performance.now();
  const one = await createTwin();
  console.log(`warm single clone: ${Math.round(performance.now() - t)} ms`);
  await one.close();
  await Promise.all(twins.map((tw) => tw.close()));
  await closeBase();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
