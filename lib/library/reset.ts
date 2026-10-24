// Reset the live system to its demo starting state (lane E4). Imported by POST /api/admin/reset-live (Lane C)
// and by scripts/reset-live.ts. Bundle-safe: the canonical accounts and the good support-agent spec are embedded
// here (no filesystem reads), so this works on Vercel. Keep CANONICAL_ACCOUNTS in sync with agents/_personas.yaml
// and GOOD_SUPPORT_SPEC with agents/support-agent/spec.yaml (scripts/seed-agents.ts checks both and warns).
import { sql } from '../db';

export interface CanonicalAccount {
  id: string;
  owner: string;
  email: string;
  balance: number;
  monthly_payment: number;
}

export const CANONICAL_ACCOUNTS: CanonicalAccount[] = [
  { id: 'A-100', owner: 'Dana Lee', email: 'dana@lonestarcu.org', balance: 412.0, monthly_payment: 412.0 },
  { id: 'A-101', owner: 'Marcus Villarreal', email: 'marcus@lonestarcu.org', balance: 1250.0, monthly_payment: 375.0 },
  { id: 'A-102', owner: 'Rosa Delgado', email: 'rosa@lonestarcu.org', balance: 640.0, monthly_payment: 320.0 },
  { id: 'A-103', owner: 'Travis Whitfield', email: 'travis@lonestarcu.org', balance: 905.5, monthly_payment: 410.0 },
  { id: 'A-104', owner: 'Priya Raman', email: 'priya@lonestarcu.org', balance: 760.25, monthly_payment: 250.0 },
  { id: 'A-105', owner: 'Hector Garza', email: 'hector@lonestarcu.org', balance: 1180.0, monthly_payment: 295.0 },
  { id: 'A-106', owner: 'Kaylee Brooks', email: 'kaylee@lonestarcu.org', balance: 88.4, monthly_payment: 150.0 },
  { id: 'A-107', owner: 'Earl Thibodeaux', email: 'earl@lonestarcu.org', balance: 1975.0, monthly_payment: 560.0 },
  { id: 'A-108', owner: 'Mei Chen', email: 'mei@lonestarcu.org', balance: 322.1, monthly_payment: 210.0 },
  { id: 'A-109', owner: 'Darnell Jackson', email: 'darnell@lonestarcu.org', balance: 1490.0, monthly_payment: 480.0 },
  { id: 'A-110', owner: 'Lupe Herrera', email: 'lupe@lonestarcu.org', balance: 515.75, monthly_payment: 265.0 },
  { id: 'A-111', owner: 'Cody McAllister', email: 'cody@lonestarcu.org', balance: 0.0, monthly_payment: 175.0 },
  { id: 'A-112', owner: 'Grace Okafor', email: 'grace@lonestarcu.org', balance: 1660.0, monthly_payment: 600.0 },
  { id: 'A-113', owner: 'Wyatt Sorensen', email: 'wyatt@lonestarcu.org', balance: 245.0, monthly_payment: 245.0 },
  { id: 'A-114', owner: 'Esperanza Ruiz', email: 'esperanza@lonestarcu.org', balance: 830.0, monthly_payment: 330.0 },
  { id: 'A-115', owner: 'Bobby Nguyen', email: 'bobby@lonestarcu.org', balance: 1105.6, monthly_payment: 390.0 },
  { id: 'A-116', owner: 'Tammy Kowalski', email: 'tammy@lonestarcu.org', balance: 470.0, monthly_payment: 235.0 },
  { id: 'A-117', owner: 'Jesse Alvarado', email: 'jesse@lonestarcu.org', balance: 59.0, monthly_payment: 160.0 },
  { id: 'A-118', owner: 'Linda Whitfield-Pruitt', email: 'linda@lonestarcu.org', balance: 0.0, monthly_payment: 180.0 },
  { id: 'A-119', owner: 'Raymond Castillo', email: 'raymond@lonestarcu.org', balance: 1320.0, monthly_payment: 440.0 },
];

/** agents/support-agent/spec.yaml, the good version (the one with the once-per-30-days credit line). */
export const GOOD_SUPPORT_SPEC = `name: support-agent
goal: >
  Help credit union members with billing questions and payment problems.
profile: careful
inherit: [brand-tone, compliance, escalation]
tools: [accounts.get, accounts.apply_credit, payments.defer, crm.add_note, approval.request, email.send]
instructions: |
  Explain options in plain language.
  Before any credit, call accounts.get and check credits_last_30_days.
  A goodwill credit of up to $25 may be applied once per member per 30 days.
  Any payment change requires an approval request: call payments.defer, which routes it to a human.
  Add a CRM note for every credit, payment request or request you decline.
test_packs: [security, compliance, money-safety, read-only, escalation]
gate:
  min_pass_rate: 1.0
  runs_per_scenario: 1
`;

/**
 * Two pending approvals that keep the Approvals screen from being empty after a reset (PRD 17b).
 * They are plausible requests an agent would have filed; deciding them in the UI is safe.
 */
export const DEMO_PENDING_APPROVALS: { type: string; account_id: string; details: string; tool_args: unknown; hours_ago: number }[] = [
  {
    type: 'payments.defer',
    account_id: 'A-115',
    details: 'Bobby Nguyen asked to skip one autopay after his hours were cut; will pay double next month.',
    tool_args: { account_id: 'A-115', months: 1, reason: 'hours cut at work, asked to skip one autopay' },
    hours_ago: 3,
  },
  {
    type: 'card.dispute',
    account_id: 'A-104',
    details: 'Dispute $84.17 from SQ *BRAZOS VALLEY GRILL on Oct 19; member says she was not there.',
    tool_args: { account_id: 'A-104', type: 'card.dispute', details: 'SQ *BRAZOS VALLEY GRILL, Oct 19, $84.17' },
    hours_ago: 26,
  },
];

const q = (v: string) => `'${v.replace(/'/g, "''")}'`;

/** The reset as plain idempotent SQL statements (used by resetLive and by `scripts/reset-live.ts --sql`). */
export function resetLiveStatements(opts: { keepDemoApprovals?: boolean } = {}): string[] {
  const keep = opts.keepDemoApprovals ?? true;
  const ids = CANONICAL_ACCOUNTS.map((a) => q(a.id)).join(', ');
  const values = CANONICAL_ACCOUNTS.map(
    (a) => `(${q(a.id)}, ${q(a.owner)}, ${q(a.email)}, ${a.balance.toFixed(2)}, ${a.monthly_payment.toFixed(2)}, 'active')`,
  ).join(',\n  ');
  const stmts = [
    'truncate sys.credits, sys.deferrals, sys.crm_notes, sys.email_outbox, sys.approvals restart identity',
    `delete from sys.accounts where id not in (${ids})`,
    `insert into sys.accounts (id, owner, email, balance, monthly_payment, status) values\n  ${values}\n` +
      'on conflict (id) do update set owner = excluded.owner, email = excluded.email, balance = excluded.balance,\n' +
      '  monthly_payment = excluded.monthly_payment, status = excluded.status',
    `update public.agents set draft_spec_yaml = ${q(GOOD_SUPPORT_SPEC)}, updated_at = now() where name = 'support-agent'`,
  ];
  if (keep) {
    for (const a of DEMO_PENDING_APPROVALS) {
      stmts.push(
        `insert into sys.approvals (type, account_id, details, tool_args, status, created_at) values (${q(a.type)}, ${q(
          a.account_id,
        )}, ${q(a.details)}, ${q(JSON.stringify(a.tool_args))}::jsonb, 'pending', now() - interval '${a.hours_ago} hours')`,
      );
    }
  }
  return stmts;
}

/**
 * Truncates sys credits/deferrals/crm_notes/email_outbox/approvals, restores the 20 canonical accounts,
 * resets support-agent's draft to the good spec, and re-adds the 2 demo pending approvals.
 * Versions, runs and the audit log are left intact.
 */
export async function resetLive(opts: { keepDemoApprovals?: boolean } = {}): Promise<{ ok: true }> {
  const stmts = resetLiveStatements(opts);
  await sql.begin(async (tx) => {
    for (const s of stmts) await tx.unsafe(s);
  });
  return { ok: true };
}
