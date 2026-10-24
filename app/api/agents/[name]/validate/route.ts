import { validateAgent } from '@/lib/services/agents';
import { handle } from '../../../_lib/http';

type Ctx = { params: Promise<{ name: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { name } = await ctx.params;
  return handle(() => validateAgent(name));
}
