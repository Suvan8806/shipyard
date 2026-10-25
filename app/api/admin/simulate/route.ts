import { SimulateBody } from '@/lib/contracts/api';
import { simulate } from '@/lib/services/admin';
import { rateLimitReq, requireResetToken } from '@/lib/services/guard';
import { actorOf, body, handle } from '../../_lib/http';

export const maxDuration = 300;

// Needs SHIPYARD_RESET_TOKEN (Authorization: Bearer <t> or ?token=<t>); 403 when the env var is unset.
export async function POST(req: Request) {
  return handle(async () => {
    requireResetToken(req);
    rateLimitReq(req, 'simulate');
    const data = await body(req, SimulateBody);
    return simulate(data.count, actorOf(req));
  });
}
