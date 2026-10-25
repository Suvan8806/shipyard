import { after, connection } from 'next/server';
import { z } from 'zod';
import type { StressStarted, StressSummary } from '@/lib/contracts/stress';
import { dispatchCtx } from '@/lib/gate/queue';
import { listStress, startStress } from '@/lib/services/stress';
import { actorOf, body, guard, handle } from '../../../_lib/http';

// POST starts a dry-run stress test (reliability | redteam | matrix); after() generates/enqueues, dispatches one
// invocation per attempt and supervises. GET lists the agent's stress tests, newest first.
export const maxDuration = 300;

type Ctx = { params: Promise<{ name: string }> };

const Body = z.object({
  mode: z.enum(['reliability', 'redteam', 'matrix']),
  runs: z.number().int().optional(),
  count: z.number().int().optional(),
  models: z.array(z.string().min(3).max(100)).max(8).optional(),
  profile: z.enum(['fast', 'careful']).optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  const { name } = await ctx.params;
  return handle<StressStarted>(
    async () => {
      guard(req, 'deploy');
      const input = await body(req, Body);
      const { run, ...started } = await startStress(name, input, actorOf(req));
      const dispatch = dispatchCtx(req);
      after(() => run(dispatch));
      return started;
    },
    { status: 202 },
  );
}

export async function GET(_req: Request, ctx: Ctx) {
  await connection();
  const { name } = await ctx.params;
  return handle<StressSummary[]>(() => listStress(name));
}
