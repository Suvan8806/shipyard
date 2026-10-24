import { DecisionBody } from '@/lib/contracts/api';
import { decide } from '@/lib/services/approvals';
import { ServiceError } from '@/lib/services/errors';
import { actorOf, body, guard, handle } from '../../_lib/http';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return handle(async () => {
    guard(req, 'write');
    if (!/^\d+$/.test(id)) throw new ServiceError('bad_request', 'approval id must be an integer');
    const data = await body(req, DecisionBody);
    return decide(Number(id), data.decision, actorOf(req));
  });
}
