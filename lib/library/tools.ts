// The 7 built-in tools (PRD 8.4). All SQL is parameterized and targets sys.* through ctx.db only.
// Numeric columns come back as strings from postgres/pglite, so convert with Number().
import { z } from 'zod';
import type { Row, SystemDb } from '../types';
import { defineTool } from './registry';

const companyDomain = () => (process.env.SHIPYARD_COMPANY_DOMAIN || 'lonestarcu.org').toLowerCase();

function normAccount(r: Row): Row {
  return { ...r, balance: Number(r.balance), monthly_payment: Number(r.monthly_payment) };
}
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

/** True when the recipient is outside the company domain AND is not an account owner's own email. */
export async function isExternalRecipient(db: SystemDb, to: string): Promise<boolean> {
  const addr = to.trim().toLowerCase();
  const domain = addr.split('@')[1] ?? '';
  if (domain === companyDomain()) return false;
  const rows = await db.query<{ n: number }>(
    'select count(*)::int as n from sys.accounts where lower(email) = $1',
    [addr],
  );
  return Number(rows[0]?.n ?? 0) === 0;
}

export const accountsGet = defineTool({
  name: 'accounts.get',
  description: 'Look up a member account by id, including credits applied in the last 30 days.',
  params: z.object({ account_id: z.string().min(1) }),
  handler: async ({ db }, { account_id }) => {
    const rows = await db.query('select * from sys.accounts where id = $1', [account_id]);
    if (!rows[0]) return { error: `account ${account_id} not found` };
    const credits = await db.query<{ amount: string; created_at: unknown }>(
      `select amount, created_at from sys.credits
       where account_id = $1 and created_at > now() - interval '30 days' order by created_at desc`,
      [account_id],
    );
    return {
      ...normAccount(rows[0]),
      credits_last_30_days: credits.map((c) => ({ amount: Number(c.amount), created_at: iso(c.created_at) })),
    };
  },
});

export const accountsFind = defineTool({
  name: 'accounts.find',
  description: 'Find member accounts by owner name (case-insensitive partial match).',
  params: z.object({ owner_name: z.string().min(1) }),
  handler: async ({ db }, { owner_name }) => {
    const rows = await db.query('select * from sys.accounts where owner ilike $1 order by id limit 20', [
      `%${owner_name}%`,
    ]);
    return { accounts: rows.map(normAccount) };
  },
});

export const accountsApplyCredit = defineTool({
  name: 'accounts.apply_credit',
  description: 'Apply a goodwill credit to a member account. Decreases the balance by the amount.',
  params: z.object({ account_id: z.string().min(1), amount: z.number().positive(), reason: z.string().min(1) }),
  handler: async ({ db }, { account_id, amount, reason }) => {
    const acct = await db.query('select id from sys.accounts where id = $1', [account_id]);
    if (!acct[0]) return { error: `account ${account_id} not found` };
    const ins = await db.query<{ id: number }>(
      'insert into sys.credits (account_id, amount, reason) values ($1, $2, $3) returning id',
      [account_id, amount, reason],
    );
    const upd = await db.query<{ balance: string }>(
      'update sys.accounts set balance = balance - $2 where id = $1 returning balance',
      [account_id, amount],
    );
    return { status: 'credited', credit_id: ins[0]?.id, account_id, amount, new_balance: Number(upd[0]?.balance) };
  },
});

export const paymentsDefer = defineTool({
  name: 'payments.defer',
  description: 'Defer upcoming loan payments by a number of months. Routed to a human for approval.',
  params: z.object({
    account_id: z.string().min(1),
    months: z.number().int().min(1).max(12),
    reason: z.string().min(1),
  }),
  handler: async ({ db }, { account_id, months, reason }) => {
    const ins = await db.query<{ id: number }>(
      'insert into sys.deferrals (account_id, months, reason) values ($1, $2, $3) returning id',
      [account_id, months, reason],
    );
    return { status: 'deferred', deferral_id: ins[0]?.id, account_id, months };
  },
});

export const crmAddNote = defineTool({
  name: 'crm.add_note',
  description: 'Add a note to the member CRM record.',
  params: z.object({ account_id: z.string().min(1), body: z.string().min(1) }),
  handler: async ({ db }, { account_id, body }) => {
    const ins = await db.query<{ id: number }>(
      'insert into sys.crm_notes (account_id, body) values ($1, $2) returning id',
      [account_id, body],
    );
    return { status: 'noted', note_id: ins[0]?.id };
  },
});

export const emailSend = defineTool({
  name: 'email.send',
  description: "Send an email. Emails outside the company domain (and not the member's own address) are external.",
  params: z.object({ to: z.string().min(3), subject: z.string(), body: z.string() }),
  handler: async ({ db }, { to, subject, body }) => {
    const external = await isExternalRecipient(db, to);
    const ins = await db.query<{ id: number }>(
      'insert into sys.email_outbox (to_addr, subject, body, external) values ($1, $2, $3, $4) returning id',
      [to, subject, body, external],
    );
    return { status: 'sent', email_id: ins[0]?.id, external };
  },
});

export const approvalRequest = defineTool({
  name: 'approval.request',
  description: 'Request human approval for an action.',
  params: z.object({ type: z.string().min(1), account_id: z.string().min(1), details: z.string().min(1) }),
  handler: async ({ db }, { type, account_id, details }) => {
    const ins = await db.query<{ id: number }>(
      `insert into sys.approvals (type, account_id, details, status) values ($1, $2, $3, 'pending') returning id`,
      [type, account_id, details],
    );
    return { status: 'pending_approval', approval_id: ins[0]?.id };
  },
});
