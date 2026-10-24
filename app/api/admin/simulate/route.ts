import { SimulateBody, type SimulateResponse } from '@/lib/contracts/api';
import { ok, parseBody, requireAdmin } from '../../_lib/http';

export const maxDuration = 300;

// W0 STUB: pretends `count` persona chats ran.
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { data, error } = await parseBody(req, SimulateBody);
  if (error) return error;
  return ok<SimulateResponse>({
    runs: data.count,
    cost_usd: Number((data.count * 0.0143).toFixed(4)),
    policy_blocks: Math.floor(data.count / 3),
    approvals: Math.floor(data.count / 4),
  });
}
