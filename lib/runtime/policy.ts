// Policy enforcement (PRD 8.5). Runs before every tool handler.
import type { AgentSpec, SystemDb } from '../types';
import { POLICIES } from '../library/policies';
import { isExternalRecipient } from '../library/tools';

export type PolicyDecision =
  | { kind: 'allow' }
  | { kind: 'block'; reason: string }
  | { kind: 'approval'; approvalId: number };

/** Per-run state: allowed calls per tool (one run = the whole multi-turn conversation). */
export interface RunState { calls: Record<string, number> }
export const newRunState = (): RunState => ({ calls: {} });

type Args = Record<string, unknown>;

function money(n: number): string[] {
  const fixed = n.toFixed(2);
  const out = [fixed, fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ',')];
  if (Number.isInteger(n)) out.push(`$${n}`, `${n} dollars`);
  return out;
}

/** Does this text mention any account id or any account balance in the DB? */
async function leaksAccountData(
  db: SystemDb,
  text: string,
  kinds: ('account_id' | 'balance')[],
): Promise<string | null> {
  const lower = text.toLowerCase();
  const accounts = await db.query<{ id: string; balance: string }>('select id, balance from sys.accounts');
  for (const a of accounts) {
    if (kinds.includes('account_id') && lower.includes(String(a.id).toLowerCase())) return `account id ${a.id}`;
    if (kinds.includes('balance')) {
      const hit = money(Number(a.balance)).find((m) => lower.includes(m.toLowerCase()));
      if (hit) return `a balance value (${hit})`;
    }
  }
  return null;
}

function describe(tool: string, args: Args): string {
  const parts = Object.entries(args)
    .filter(([k]) => k !== 'account_id')
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`);
  return `${tool}${parts.length ? `: ${parts.join(', ')}` : ''}`;
}

export async function checkPolicy(input: {
  tool: string;
  args: Args;
  spec: AgentSpec;
  runState: RunState;
  db: SystemDb;
  runId: string;
}): Promise<PolicyDecision> {
  const { tool, args, spec, runState, db } = input;
  const policy = POLICIES[tool];
  if (!policy) {
    runState.calls[tool] = (runState.calls[tool] ?? 0) + 1;
    return { kind: 'allow' };
  }

  if (policy.allowedAgents && !policy.allowedAgents.includes(spec.name)) {
    return { kind: 'block', reason: `policy: agent "${spec.name}" is not allowed to call ${tool}` };
  }
  if (policy.maxCallsPerRun !== undefined && (runState.calls[tool] ?? 0) >= policy.maxCallsPerRun) {
    return {
      kind: 'block',
      reason: `policy: ${tool} may be called at most ${policy.maxCallsPerRun} time(s) per conversation`,
    };
  }
  if (policy.maxAmount !== undefined && typeof args.amount === 'number' && args.amount > policy.maxAmount) {
    return { kind: 'block', reason: `policy: amount ${args.amount} exceeds the $${policy.maxAmount} limit for ${tool}` };
  }
  if (policy.blockExternalIfContains?.length && typeof args.to === 'string') {
    if (await isExternalRecipient(db, args.to)) {
      const text = `${String(args.subject ?? '')}\n${String(args.body ?? '')}`;
      const leak = await leaksAccountData(db, text, policy.blockExternalIfContains);
      if (leak) {
        return { kind: 'block', reason: `policy: external email to ${args.to} contains ${leak}` };
      }
    }
  }
  if (policy.requiresApproval) {
    const rows = await db.query<{ id: number }>(
      `insert into sys.approvals (type, account_id, details, tool_args, status)
       values ($1, $2, $3, $4::jsonb, 'pending') returning id`,
      [tool, typeof args.account_id === 'string' ? args.account_id : null, describe(tool, args), JSON.stringify(args)],
    );
    runState.calls[tool] = (runState.calls[tool] ?? 0) + 1;
    return { kind: 'approval', approvalId: Number(rows[0]?.id) };
  }

  runState.calls[tool] = (runState.calls[tool] ?? 0) + 1;
  return { kind: 'allow' };
}
