import { connection } from 'next/server';
import { getRunTrace } from '@/lib/services/runs';
import { handle } from '../../_lib/http';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  await connection();
  const { id } = await ctx.params;
  return handle(() => getRunTrace(id));
}
