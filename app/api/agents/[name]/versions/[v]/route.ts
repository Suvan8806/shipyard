import { after, connection } from 'next/server';
import { dispatchCtx, pump } from '@/lib/gate/queue';
import { getGateResult, reconcileGate } from '@/lib/services/deploy';
import { handle } from '../../../../_lib/http';

// Reads double as the gate's safety net: stale attempts are swept, a finished queue is finalized, and lost
// dispatches are re-pumped in after() (which may run an attempt inline, hence the long maxDuration).
export const maxDuration = 300;

type Ctx = { params: Promise<{ name: string; v: string }> };

export async function GET(req: Request, ctx: Ctx) {
  await connection();
  const { name, v } = await ctx.params;
  const version = /^\d+$/.test(v) ? Number(v) : NaN;
  return handle(async () => {
    const { needsPump } = await reconcileGate(name, version);
    if (needsPump) {
      const dispatch = dispatchCtx(req);
      after(() => pump(name, version, dispatch));
    }
    return getGateResult(name, version);
  });
}
