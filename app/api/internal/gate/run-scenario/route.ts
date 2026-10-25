import { after } from 'next/server';
import { z } from 'zod';
import { dispatchCtx, isInternalRequest, runClaimed } from '@/lib/gate/queue';
import { body, fail, handle } from '../../../_lib/http';

// Fan-out gate worker: runs ONE claimed scenario attempt in its own invocation (own 300 s budget), then pumps the
// next queued attempt and finalizes the version when everything is terminal. Internal only (shared secret).
export const maxDuration = 300;

const Body = z.object({
  agent: z.string().min(1).max(80),
  version: z.number().int().positive(),
  scenario: z.string().min(1).max(300),
  attempt: z.number().int().positive().max(20),
});

export async function POST(req: Request) {
  if (!isInternalRequest(req)) return fail('unauthorized', 'internal endpoint');
  return handle(
    async () => {
      const job = await body(req, Body);
      const ctx = dispatchCtx(req);
      after(async () => {
        try {
          await runClaimed(job.agent, job.version, job.scenario, job.attempt, ctx);
        } catch (e) {
          console.error('[gate] worker failed', job, e);
        }
      });
      return { accepted: true };
    },
    { status: 202 },
  );
}
