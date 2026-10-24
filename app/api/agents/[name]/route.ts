import { connection } from 'next/server';
import { getAgentDetail } from '@/lib/services/agents';
import { handle } from '../../_lib/http';

type Ctx = { params: Promise<{ name: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  await connection();
  const { name } = await ctx.params;
  return handle(() => getAgentDetail(name));
}
