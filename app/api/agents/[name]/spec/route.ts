import { PutSpecBody } from '@/lib/contracts/api';
import { resolveUser, requireAgentRole } from '@/lib/services/authz';
import { saveSpec } from '@/lib/services/agents';
import { actorOf, body, guard, handle } from '../../../_lib/http';

type Ctx = { params: Promise<{ name: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const { name } = await ctx.params;
  return handle(async () => {
    guard(req, 'write');
    const user = await resolveUser(req);
    await requireAgentRole(user, 'edit_spec', name);
    const data = await body(req, PutSpecBody);
    return saveSpec(name, data.spec_yaml, user.is_guest ? actorOf(req) : user.id);
  });
}
