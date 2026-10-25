// Executes the tool call held by a pending sys.approvals row (bypassing requiresApproval) and writes the audit log.
// The row is claimed atomically first (pending -> approved), so two concurrent approves can't both run the call.
import type { ExecuteApprovedCallFn, SystemDb } from '../types';
import { getTool } from '../library';
import { ServiceError } from '../services/errors';

export type AuditFn = (actor: string, action: string, target: string | null, detail?: unknown) => Promise<void>;

type ApprovalRow = { id: number; type: string; account_id: string | null; tool_args: unknown; status: string };

async function defaultAudit(): Promise<AuditFn> {
  return (await import('../platform/repo')).audit;
}

/**
 * Atomically moves a pending approval to `status`. Returns the claimed row; throws not_found / conflict (409) when
 * the row is missing or was already decided (e.g. a double-click or a concurrent approver).
 */
export async function claimApproval(db: SystemDb, approvalId: number, status: 'approved' | 'rejected'): Promise<ApprovalRow> {
  const claimed = await db.query<ApprovalRow>(
    `update sys.approvals set status = $2, decided_at = now() where id = $1 and status = 'pending' returning *`,
    [approvalId, status],
  );
  if (claimed[0]) return claimed[0];
  const rows = await db.query<{ status: string }>('select status from sys.approvals where id = $1', [approvalId]);
  if (!rows[0]) throw new ServiceError('not_found', `approval ${approvalId} not found`);
  throw new ServiceError('conflict', `approval ${approvalId} already decided: it is already ${rows[0].status}`);
}

export async function executeApprovedCallWith(approvalId: number, db: SystemDb, audit?: AuditFn): Promise<unknown> {
  const row = await claimApproval(db, approvalId, 'approved');

  const def = getTool(row.type);
  const rawArgs = typeof row.tool_args === 'string' ? JSON.parse(row.tool_args) : row.tool_args;
  let result: unknown = { status: 'approved' };
  if (def && rawArgs) {
    const args = def.params.parse(rawArgs);
    result = await def.handler({ db, agent: 'human-approver', runId: `approval-${approvalId}` }, args);
  }
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
