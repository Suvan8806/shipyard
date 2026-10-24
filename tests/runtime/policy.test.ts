import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { checkPolicy, newRunState } from '../../lib/runtime/policy';
import { executeApprovedCallWith } from '../../lib/runtime/approvals';
import type { AgentSpec } from '../../lib/types';
import { DANA, pgliteDb, seed, type TestDb } from './helpers';

const spec: AgentSpec = {
  name: 'support-agent',
  goal: 'help',
  profile: 'careful',
  inherit: [],
  tools: ['accounts.get', 'accounts.apply_credit', 'payments.defer', 'email.send'],
  instructions: '',
  test_packs: [],
  gate: { min_pass_rate: 1, runs_per_scenario: 1, variants: 0 },
};

let db: TestDb;
beforeAll(async () => {
  db = await pgliteDb();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec('truncate sys.accounts, sys.credits, sys.deferrals, sys.approvals, sys.email_outbox, sys.crm_notes');
  await seed(db, { accounts: [DANA] });
});

const check = (tool: string, args: Record<string, unknown>, runState = newRunState()) =>
  checkPolicy({ tool, args, spec, runState, db, runId: 'r1' });

describe('checkPolicy', () => {
  it('requiresApproval holds payments.defer as a pending approval with tool_args', async () => {
    const d = await check('payments.defer', { account_id: 'A-100', months: 1, reason: 'car repair' });
    expect(d.kind).toBe('approval');
    const rows = await db.query<{ type: string; status: string; tool_args: unknown }>('select * from sys.approvals');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'payments.defer', status: 'pending' });
    expect(rows[0].tool_args).toMatchObject({ months: 1 });
    expect(await db.query('select * from sys.deferrals')).toHaveLength(0);
  });

  it('maxAmount rejects a $200 credit', async () => {
    const d = await check('accounts.apply_credit', { account_id: 'A-100', amount: 200, reason: 'x' });
    expect(d).toMatchObject({ kind: 'block' });
    if (d.kind === 'block') expect(d.reason).toContain('exceeds the $25 limit');
  });

  it('maxCallsPerRun rejects the second credit in a run', async () => {
    const rs = newRunState();
    expect((await check('accounts.apply_credit', { account_id: 'A-100', amount: 25, reason: 'x' }, rs)).kind).toBe('allow');
    expect((await check('accounts.apply_credit', { account_id: 'A-100', amount: 10, reason: 'x' }, rs)).kind).toBe('block');
  });

  it('blocks an external email containing the account id', async () => {
    const d = await check('email.send', { to: 'me@gmail.com', subject: 'hi', body: 'Your account A-100 is fine' });
    expect(d.kind).toBe('block');
  });

  it('blocks an external email containing the balance', async () => {
    const d = await check('email.send', { to: 'me@gmail.com', subject: 'hi', body: 'You owe $412.00' });
    expect(d.kind).toBe('block');
  });

  it('allows an internal email with account data', async () => {
    const d = await check('email.send', { to: 'billing@lonestarcu.org', subject: 'A-100', body: 'balance 412.00' });
    expect(d.kind).toBe('allow');
  });

  it("allows an email to the member's own address on file", async () => {
    const d = await check('email.send', { to: 'Dana@LoneStarCU.org', subject: 'A-100', body: 'balance 412.00' });
    expect(d.kind).toBe('allow');
  });

  it('executeApprovedCall runs the held deferral and marks it approved', async () => {
    const d = await check('payments.defer', { account_id: 'A-100', months: 2, reason: 'hardship' });
    if (d.kind !== 'approval') throw new Error('expected approval');
    const audits: unknown[] = [];
    const result = await executeApprovedCallWith(d.approvalId, db, async (...a) => {
      audits.push(a);
    });
    expect(result).toMatchObject({ status: 'deferred', months: 2 });
    expect(await db.query('select * from sys.deferrals')).toHaveLength(1);
    const [row] = await db.query<{ status: string }>('select status from sys.approvals');
    expect(row.status).toBe('approved');
    expect(audits).toHaveLength(1);
    await expect(executeApprovedCallWith(d.approvalId, db, async () => {})).rejects.toThrow(/already approved/);
  });
});
