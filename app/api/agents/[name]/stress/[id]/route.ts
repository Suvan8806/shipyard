import { after, connection } from 'next/server';
import type { StressResult } from '@/lib/contracts/stress';
import { dispatchCtx } from '@/lib/gate/queue';
import { getStress, pumpStress, reconcileStressById } from '@/lib/services/stress';
import { handle } from '../../../../_lib/http';

// Reads double as the stress run's safety net (stale sweep, finalize, re-pump lost dispatches in after()).
export const maxDuration = 300;

type Ctx = { params: Promise<{ name: string; id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  await connection();
  const { name, id } = await ctx.params;
  return handle<StressResult>(async () => {
    const { version, needsPump } = await reconcileStressById(name, id);
    if (needsPump) {
      const dispatch = dispatchCtx(req);
      after(() => pumpStress(name, version, dispatch));
    }
    return getStress(name, id);
  });
}
