import { PutSpecBody } from '@/lib/contracts/api';
import { saveSpec } from '@/lib/services/agents';
import { actorOf, body, guard, handle } from '../../../_lib/http';

type Ctx = { params: Promise<{ name: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const { name } = await ctx.params;
  return handle(async () => {
    guard(req, 'write');
    const data = await body(req, PutSpecBody);
    return saveSpec(name, data.spec_yaml, actorOf(req));
  });
}
