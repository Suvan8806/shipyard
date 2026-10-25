import { after } from 'next/server';
import type { DeployResponse } from '@/lib/contracts/api';
import { dispatchCtx } from '@/lib/gate/queue';
import { startDeploy } from '@/lib/services/deploy';
import { actorOf, guard, handle } from '../../../_lib/http';

// after() enqueues the gate and dispatches the first attempts (one serverless invocation per attempt), then returns.
export const maxDuration = 300;

type Ctx = { params: Promise<{ name: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { name } = await ctx.params;
  return handle<DeployResponse>(
    async () => {
      guard(req, 'deploy');
      const { version, status, run } = await startDeploy(name, actorOf(req));
      const dispatch = dispatchCtx(req);
      after(async () => {
        await run({ ctx: dispatch, wait: false });
      });
      return { version, status };
    },
    { status: 202 },
  );
}
