import { resolveUser, requireAgentRole } from '@/lib/services/authz';
import { rollback } from '@/lib/services/deploy';
import { actorOf, guard, handle } from '../../../_lib/http';

type Ctx = { params: Promise<{ name: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { name } = await ctx.params;
  return handle(async () => {
    guard(req, 'write');
    const user = await resolveUser(req);
    await requireAgentRole(user, 'rollback', name);
    return rollback(name, user.is_guest ? actorOf(req) : user.id);
  });
}
