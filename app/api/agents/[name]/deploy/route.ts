import { after } from 'next/server';
import type { DeployResponse } from '@/lib/contracts/api';
import { startDeploy } from '@/lib/services/deploy';
import { actorOf, guard, handle } from '../../../_lib/http';

// The gate keeps running in after() once the response is sent; bounded by maxDuration.
export const maxDuration = 300;

type Ctx = { params: Promise<{ name: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { name } = await ctx.params;
  return handle<DeployResponse>(
    async () => {
      guard(req, 'deploy');
      const { version, status, run } = await startDeploy(name, actorOf(req));
      after(async () => {
        await run();
      });
      return { version, status };
    },
    { status: 202 },
  );
}
