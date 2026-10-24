import { afterAll, describe, expect, it } from 'vitest';
import { closeBase, createTwin } from '@/lib/twins/twin';
import { countAdded, diffSnapshots } from '@/lib/twins/diff';
import type { Snapshot } from '@/lib/types';

afterAll(async () => {
  await closeBase();
});

const empty = (): Snapshot => ({ accounts: [], credits: [], deferrals: [], crm_notes: [], email_outbox: [], approvals: [] });

describe('diffSnapshots', () => {
  it('returns {} when nothing changed', () => {
    const s = { ...empty(), accounts: [{ id: 'A-1', balance: 10 }] };
    expect(diffSnapshots(s, structuredClone(s))).toEqual({});
  });

  it('reports added, removed and changed rows keyed by id', () => {
    const before = {
      ...empty(),
      accounts: [{ id: 'A-1', balance: 10, status: 'active' }, { id: 'A-2', balance: 5, status: 'active' }],
      credits: [{ id: 1, amount: 25 }],
    };
    const after = {
      ...empty(),
      accounts: [{ id: 'A-1', balance: 0, status: 'active' }],
      credits: [{ id: 1, amount: 25 }, { id: 2, amount: 25 }],
    };
    const d = diffSnapshots(before, after);
    expect(Object.keys(d).sort()).toEqual(['accounts', 'credits']);
    expect(d.credits?.added).toEqual([{ id: 2, amount: 25 }]);
    expect(d.accounts?.removed).toEqual([{ id: 'A-2', balance: 5, status: 'active' }]);
    expect(d.accounts?.changed).toEqual([
      { before: before.accounts[0], after: after.accounts[0], columns: ['balance'] },
    ]);
    expect(countAdded(d)).toBe(1);
  });
});

describe('createTwin', () => {
  it('seeds with days_ago, snapshots normalized values, and diffs one added credit', async () => {
    const twin = await createTwin();
    try {
      expect(twin.db.kind).toBe('twin');
      await twin.seed({
        accounts: [{ id: 'A-100', owner: 'Dana Lee', email: 'dana@lonestarcu.org', balance: 412, monthly_payment: 412 }],
        credits: [{ account_id: 'A-100', amount: 25, reason: 'late fee goodwill', days_ago: 6 }],
      });
      const before = await twin.snapshot();
      expect(before.accounts[0].balance).toBe(412);
      expect(before.credits[0].amount).toBe(25);
      const ageDays = (Date.now() - Date.parse(String(before.credits[0].created_at))) / 86_400_000;
      expect(ageDays).toBeGreaterThan(5.9);
      expect(ageDays).toBeLessThan(6.1);

      await twin.db.query('insert into sys.credits (account_id, amount, reason) values ($1, $2, $3)', ['A-100', 25, 'again']);
      const d = diffSnapshots(before, await twin.snapshot());
      expect(Object.keys(d)).toEqual(['credits']);
      expect(d.credits?.added).toHaveLength(1);
      expect(d.credits?.added[0]).toMatchObject({ id: 2, account_id: 'A-100', amount: 25 });
    } finally {
      await twin.close();
    }
  });

  it('isolates twins from each other', async () => {
    const [a, b] = await Promise.all([createTwin(), createTwin()]);
    try {
      await a.seed({ accounts: [{ id: 'A-1', owner: 'x', email: 'x@y', balance: 1, monthly_payment: 1 }] });
      expect((await b.snapshot()).accounts).toEqual([]);
      const rows = await b.db.query<{ n: number }>('select count(*) as n from sys.accounts');
      expect(rows[0].n).toBe(0); // bigint normalized to number
    } finally {
      await Promise.all([a.close(), b.close()]);
    }
  });

  it('rejects unknown tables and columns in setup', async () => {
    const twin = await createTwin();
    try {
      await expect(twin.seed({ nope: [{ id: 1 }] } as never)).rejects.toThrow(/unknown table/);
      await expect(twin.seed({ accounts: [{ id: 'A-1', hacked: 1 }] })).rejects.toThrow(/unknown column/);
    } finally {
      await twin.close();
    }
  });
});
