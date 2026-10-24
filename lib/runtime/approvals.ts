// Executes the tool call held by a pending sys.approvals row (bypassing requiresApproval), marks it approved
// and writes the audit log.
import type { ExecuteApprovedCallFn, SystemDb } from '../types';
import { getTool } from '../library';

export type AuditFn = (actor: string, action: string, target: string | null, detail?: unknown) => Promise<void>;

async function defaultAudit(): Promise<AuditFn> {
  return (await import('../platform/repo')).audit;
}

export async function executeApprovedCallWith(approvalId: number, db: SystemDb, audit?: AuditFn): Promise<unknown> {
  const rows = await db.query<{ id: number; type: string; account_id: string | null; tool_args: unknown; status: string }>(
    'select id, type, account_id, tool_args, status from sys.approvals where id = $1',
    [approvalId],
  );
  const row = rows[0];
  if (!row) throw new Error(`approval ${approvalId} not found`);
  if (row.status !== 'pending') throw new Error(`approval ${approvalId} is already ${row.status}`);

  const def = getTool(row.type);
  const rawArgs = typeof row.tool_args === 'string' ? JSON.parse(row.tool_args) : row.tool_args;
  let result: unknown = { status: 'approved' };
  if (def && rawArgs) {
    const args = def.params.parse(rawArgs);
    result = await def.handler({ db, agent: 'human-approver', runId: `approval-${approvalId}` }, args);
  }
  await db.query(`update sys.approvals set status = 'approved', decided_at = now() where id = $1`, [approvalId]);
  try {
    await (audit ?? (await defaultAudit()))('human', 'approval.execute', `approval:${approvalId}`, {
      type: row.type,
      account_id: row.account_id,
      tool_args: rawArgs,
      result,
    });
  } catch (e) {
    console.error('[approvals] audit failed:', e instanceof Error ? e.message : e);
  }
  return result;
}

export const executeApprovedCall: ExecuteApprovedCallFn = (approvalId, db) => executeApprovedCallWith(approvalId, db);
