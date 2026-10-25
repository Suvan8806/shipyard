// Approvals live in the live system DB (sys.approvals). Approve executes the held tool call on live.
import * as repo from '../platform/repo';
import { liveDb } from '../sysdb/live';
import { claimApproval, executeApprovedCall } from '../runtime/approvals';
import type { Approval, DecisionResponse } from '../contracts/api';
import { ServiceError, isServiceError, notFound } from './errors';

type Status = Approval['status'];
const STATUSES: Status[] = ['pending', 'approved', 'rejected'];

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

function toApproval(r: Record<string, unknown>): Approval {
  return {
    id: Number(r.id),
    type: String(r.type),
    account_id: r.account_id == null ? null : String(r.account_id),
    details: r.details == null ? null : String(r.details),
    tool_args: r.tool_args ?? null,
    status: r.status as Status,
    created_at: iso(r.created_at),
    decided_at: r.decided_at == null ? null : iso(r.decided_at),
  };
}

export function parseStatus(s: string | null | undefined): Status | undefined {
  if (!s) return undefined;
  if (!STATUSES.includes(s as Status)) throw new ServiceError('bad_request', `status must be one of ${STATUSES.join(', ')}`);
  return s as Status;
}

export async function listApprovals(status?: Status): Promise<Approval[]> {
  const db = liveDb();
  const rows = status
    ? await db.query('select * from sys.approvals where status = $1 order by created_at desc limit 200', [status])
    : await db.query('select * from sys.approvals order by created_at desc limit 200');
  return rows.map(toApproval);
}

export async function decide(id: number, decision: 'approve' | 'reject', actor = 'api'): Promise<DecisionResponse> {
  if (!Number.isInteger(id) || id < 1) throw new ServiceError('bad_request', 'approval id must be a positive integer');
  const db = liveDb();
  const rows = await db.query('select * from sys.approvals where id = $1', [id]);
  if (!rows[0]) throw notFound(`approval ${id}`);
  const current = toApproval(rows[0]);
  if (current.status !== 'pending') throw new ServiceError('conflict', `approval ${id} already decided: it is already ${current.status}`);

  if (decision === 'approve') {
    // executeApprovedCall claims the row atomically (pending -> approved) before running the held call, so a
    // concurrent second approve gets a 409 conflict instead of executing the call twice.
    let result: unknown;
    try {
      result = await executeApprovedCall(id, db);
    } catch (e) {
      if (isServiceError(e)) throw e;
      const message = e instanceof Error ? e.message : String(e);
      await repo.audit(actor, 'approval.execute_failed', String(id), { message });
      throw new ServiceError('internal', `approved call failed: ${message}`);
    }
    await repo.audit(actor, 'approval.approve', String(id), { type: current.type, account_id: current.account_id, result });
    return { status: 'approved' };
  }
  await claimApproval(db, id, 'rejected');
  await repo.audit(actor, 'approval.reject', String(id), { type: current.type, account_id: current.account_id });
  return { status: 'rejected' };
}
