import { connection } from 'next/server';
import { CATCH_RUN_ID, RUN_TRACE, RUN_TRACE_CATCH } from '@/lib/mock/fixtures';
import type { RunTrace } from '@/lib/contracts/api';
import { ok } from '../../_lib/http';

type Ctx = { params: Promise<{ id: string }> };

// W0 STUB: the catch run id returns the scenario trace (with diff); anything else the live trace.
export async function GET(_req: Request, ctx: Ctx) {
  await connection();
  const { id } = await ctx.params;
  return ok<RunTrace>(id === CATCH_RUN_ID ? RUN_TRACE_CATCH : RUN_TRACE);
}
