import { after } from 'next/server';
import { z } from 'zod';
import { dispatchCtx, isInternalRequest } from '@/lib/gate/queue';
import { fromStressId } from '@/lib/stress/meta';
import { runStressClaimed } from '@/lib/stress/queue';
import { body, fail, handle } from '../../../../../_lib/http';

// Stress worker: runs ONE claimed attempt of a stress test in its own invocation. Internal only (shared secret).
export const maxDuration = 300;

type Ctx = { params: Promise<{ name: string; id: string }> };

const Body = z.object({
  scenario: z.string().min(1).max(300),
  attempt: z.number().int().positive().max(20),
});

export async function POST(req: Request, ctx: Ctx) {
  if (!isInternalRequest(req)) return fail('unauthorized', 'internal endpoint');
  const { name, id } = await ctx.params;
  const version = fromStressId(id);
  if (version === null) return fail('bad_request', 'bad stress id');
  return handle(
    async () => {
      const job = await body(req, Body);
      const dispatch = dispatchCtx(req);
      after(async () => {
        try {
          await runStressClaimed(name, version, job.scenario, job.attempt, dispatch);
        } catch (e) {
          console.error('[stress] worker failed', name, id, job, e);
        }
      });
      return { accepted: true };
    },
    { status: 202 },
  );
}
