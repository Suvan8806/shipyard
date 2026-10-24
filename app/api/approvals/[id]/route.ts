import { DecisionBody, type DecisionResponse } from '@/lib/contracts/api';
import { fail, ok, parseBody, requireAdmin } from '../../_lib/http';

type Ctx = { params: Promise<{ id: string }> };

// W0 STUB: echoes the decision. Lane C: approve -> executeApprovedCall(id, liveDb()).
export async function POST(req: Request, ctx: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return fail('bad_request', 'approval id must be an integer');
  const { data, error } = await parseBody(req, DecisionBody);
  if (error) return error;
  return ok<DecisionResponse>({ status: data.decision === 'approve' ? 'approved' : 'rejected' });
}
