import { after } from 'next/server';
import type { DeployResponse } from '@/lib/contracts/api';
import { dispatchCtx } from '@/lib/gate/queue';
import { resolveUser, requireAgentRole } from '@/lib/services/authz';
import { startDeploy } from '@/lib/services/deploy';
import { replayRequested } from '@/lib/gate/replay';
import { actorOf, guard, handle } from '../../../_lib/http';

// POST /api/agents/:name/deploy[?replay=1]
// after() enqueues the gate and dispatches the first attempts (one serverless invocation per attempt), then returns.
export const maxDuration = 300;

type Ctx = { params: Promise<{ name: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { name } = await ctx.params;
  return handle<DeployResponse>(
    async () => {
      guard(req, 'deploy');
      const user = await resolveUser(req);
      await requireAgentRole(user, 'deploy', name);
      const { version, status, run } = await startDeploy(name, user.is_guest ? actorOf(req) : user.id);
      const dispatch = dispatchCtx(req);
      // ?replay=1 (or header x-shipyard-replay: 1): stage safety net, replays a cached identical-spec version.
      const replay = replayRequested(req);
      after(async () => {
        await run({ ctx: dispatch, wait: false, replay });
      });
      return { version, status };
    },
    { status: 202 },
  );
}
