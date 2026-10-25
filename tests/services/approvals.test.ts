// Atomic approval claim (M1): a second decide on the same id is a 409 conflict and the held call runs once.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DANA, pgliteDb, seed, type TestDb } from '../runtime/helpers';

let db: TestDb;
vi.mock('../../lib/sysdb/live', () => ({ liveDb: () => db }));
vi.mock('../../lib/platform/repo', () => ({ audit: async () => undefined }));

import { decide } from '../../lib/services/approvals';
import { errorResponse } from '../../app/api/_lib/http';

beforeAll(async () => {
  db = await pgliteDb();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec('truncate sys.accounts, sys.deferrals, sys.approvals');
  await seed(db, { accounts: [DANA] });
});

async function pendingDeferral(): Promise<number> {
  const [row] = await db.query<{ id: number }>(
    `insert into sys.approvals (type, account_id, details, tool_args, status)
     values ('payments.defer', 'A-100', 'defer 1 month', $1, 'pending') returning id`,
    [JSON.stringify({ account_id: 'A-100', months: 1, reason: 'hardship' })],
  );
  return Number(row.id);
}

const deferrals = async () => (await db.query('select * from sys.deferrals')).length;

describe('decide (atomic claim)', () => {
  it('approves once; a second approve is a 409 conflict and does not re-run the call', async () => {
    const id = await pendingDeferral();
    expect(await decide(id, 'approve')).toEqual({ status: 'approved' });
    const err = await decide(id, 'approve').catch((e) => e);
    expect(err).toMatchObject({ code: 'conflict', status: 409 });
    expect(err.message).toMatch(/already decided/);
    expect(errorResponse(err).status).toBe(409);
    expect(await deferrals()).toBe(1);
  });

  it('two concurrent approves execute the held call exactly once', async () => {
    const id = await pendingDeferral();
    const results = await Promise.allSettled([decide(id, 'approve'), decide(id, 'approve')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'conflict' });
    expect(await deferrals()).toBe(1);
  });

  it('reject then approve: the approve is a conflict and nothing executes', async () => {
    const id = await pendingDeferral();
    expect(await decide(id, 'reject')).toEqual({ status: 'rejected' });
    await expect(decide(id, 'approve')).rejects.toMatchObject({ code: 'conflict' });
    await expect(decide(id, 'reject')).rejects.toMatchObject({ code: 'conflict' });
    expect(await deferrals()).toBe(0);
    const [row] = await db.query<{ status: string }>('select status from sys.approvals where id = $1', [id]);
    expect(row.status).toBe('rejected');
  });
});
