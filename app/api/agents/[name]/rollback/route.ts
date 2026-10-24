import { rollback } from '@/lib/services/deploy';
import { actorOf, guard, handle } from '../../../_lib/http';

type Ctx = { params: Promise<{ name: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { name } = await ctx.params;
  return handle(async () => {
    guard(req, 'write');
    return rollback(name, actorOf(req));
  });
}
