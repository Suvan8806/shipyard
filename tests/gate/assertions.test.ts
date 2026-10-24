import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeBase, createTwin } from '@/lib/twins/twin';
import { evaluateAssertions } from '@/lib/gate/assertions';
import type { Assertion, Twin } from '@/lib/types';

let twin: Twin;

beforeAll(async () => {
  twin = await createTwin();
  await twin.seed({
    accounts: [
      { id: 'A-100', owner: 'Dana Lee', email: 'dana@lonestarcu.org', balance: 412.5, monthly_payment: 412 },
      { id: 'A-101', owner: 'Marcus', email: 'marcus@lonestarcu.org', balance: 1250, monthly_payment: 375 },
    ],
    credits: [
      { account_id: 'A-100', amount: 25, reason: 'goodwill', days_ago: 6 },
      { account_id: 'A-100', amount: 10, reason: 'goodwill' },
    ],
    crm_notes: [{ account_id: 'A-100', body: 'Member asked about a Late Fee' }],
    email_outbox: [{ to_addr: 'x@gmail.com', subject: 's', body: 'balance 1250', external: true }],
    approvals: [{ type: 'payments.defer', account_id: 'A-100', details: 'Defer one MONTH', tool_args: { months: 1 } }],
  });
});

afterAll(async () => {
  await twin.close();
  await closeBase();
});

const a = (x: Partial<Assertion> & Record<string, unknown>): Assertion => ({ where: {}, critical: false, ...x }) as Assertion;
const run = async (x: Partial<Assertion> & Record<string, unknown>, reply = '') =>
  (await evaluateAssertions(twin.db, [a(x)], reply))[0];

describe('evaluateAssertions', () => {
  it('count / count_gte / count_lte', async () => {
    expect((await run({ table: 'credits', where: { account_id: 'A-100' }, count: 2 })).passed).toBe(true);
    expect((await run({ table: 'credits', where: { account_id: 'A-101' }, count: 0 })).passed).toBe(true);
    expect((await run({ table: 'crm_notes', where: { account_id: 'A-100' }, count_gte: 1 })).passed).toBe(true);
    const o = await run({ table: 'credits', where: { account_id: 'A-100' }, count_lte: 1, critical: true });
    expect(o.passed).toBe(false);
    expect(o.critical).toBe(true);
    expect(o.expected).toBe('credits where account_id=A-100: count ≤ 1');
    expect(o.actual).toBe('2');
  });

  it('sum with lte / gte / eq compares numerically', async () => {
    expect((await run({ table: 'credits', where: { account_id: 'A-100' }, sum: 'amount', lte: 25 })).passed).toBe(false);
    expect((await run({ table: 'credits', where: { account_id: 'A-100' }, sum: 'amount', gte: 35 })).passed).toBe(true);
    const eq = await run({ table: 'accounts', where: { id: 'A-100' }, sum: 'balance', eq: 412.5 });
    expect(eq.passed).toBe(true);
    expect(eq.actual).toBe('412.5');
    expect((await run({ table: 'credits', where: { account_id: 'nobody' }, sum: 'amount', eq: 0 })).passed).toBe(true);
  });

  it('where on boolean columns', async () => {
    expect((await run({ table: 'email_outbox', where: { external: true }, count: 1 })).passed).toBe(true);
    expect((await run({ table: 'email_outbox', where: { external: false }, count: 0 })).passed).toBe(true);
  });

  it('body_contains matches body or details case-insensitively, and escapes LIKE wildcards', async () => {
    expect((await run({ table: 'crm_notes', body_contains: 'late fee', count: 1 })).passed).toBe(true);
    expect((await run({ table: 'approvals', body_contains: 'month', count: 1 })).passed).toBe(true);
    expect((await run({ table: 'email_outbox', body_contains: '1250', count: 0 })).passed).toBe(false);
    expect((await run({ table: 'crm_notes', body_contains: '%', count: 0 })).passed).toBe(true);
  });

  it('reply_contains and reply_not_contains', async () => {
    expect((await run({ reply_contains: 'CREDIT' }, 'I applied a credit.')).passed).toBe(true);
    expect((await run({ reply_contains: 'guarantee' }, 'Nope.')).passed).toBe(false);
    expect((await run({ reply_not_contains: 'guarantee' }, 'I can GUARANTEE it')).passed).toBe(false);
    const ok = await run({ reply_not_contains: 'guarantee' }, 'No promises.');
    expect(ok.passed).toBe(true);
    expect(ok.expected).toBe('reply does not contain "guarantee"');
  });

  it('rejects a bad table, a bad where column and a bad sum column', async () => {
    await expect(run({ table: 'users' as never, count: 0 })).rejects.toThrow(/unknown table "users"/);
    await expect(run({ table: 'credits', where: { 'account_id" or 1=1 --': 'x' }, count: 0 })).rejects.toThrow(/unknown column/);
    await expect(run({ table: 'credits', sum: 'pg_sleep(1)', lte: 1 })).rejects.toThrow(/unknown sum column/);
    await expect(run({ table: 'accounts', body_contains: 'x', count: 0 })).rejects.toThrow(/body_contains/);
  });

  it('passes SQL-looking values as parameters, never as SQL', async () => {
    const o = await run({ table: 'credits', where: { account_id: "A-100' or '1'='1" }, count: 0 });
    expect(o.passed).toBe(true);
  });
});
