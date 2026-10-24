import { connection } from 'next/server';
import { getGateResult } from '@/lib/services/deploy';
import { handle } from '../../../../_lib/http';

type Ctx = { params: Promise<{ name: string; v: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  await connection();
  const { name, v } = await ctx.params;
  return handle(() => getGateResult(name, /^\d+$/.test(v) ? Number(v) : NaN));
}
