import { reset } from '@/lib/services/admin';
import { rateLimitReq, requireResetToken } from '@/lib/services/guard';
import { actorOf, handle } from '../../_lib/http';

export const maxDuration = 60;

// Needs SHIPYARD_RESET_TOKEN (Authorization: Bearer <t> or ?token=<t>); 403 when the env var is unset.
// POST /api/admin/reset-live            -> resets sys tables + support-agent draft, purges live-created agents
// POST /api/admin/reset-live?purge=0    -> same, but keeps agents that are not in the seeded set
export async function POST(req: Request) {
  return handle(async () => {
    requireResetToken(req);
    rateLimitReq(req, 'write');
    const purge = new URL(req.url).searchParams.get('purge');
    return reset(actorOf(req), { purgeUnseeded: purge !== '0' && purge !== 'false' });
  });
}
