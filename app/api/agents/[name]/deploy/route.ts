import { AGENTS } from '@/lib/mock/fixtures';
import type { DeployResponse } from '@/lib/contracts/api';
import { fail, ok, requireAdmin } from '../../../_lib/http';

export const maxDuration = 300;

type Ctx = { params: Promise<{ name: string }> };

// W0 STUB: pretends to start the gate. Lane C: createVersion + after(() => runGate(...)).
export async function POST(req: Request, ctx: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { name } = await ctx.params;
  const agent = AGENTS.find((a) => a.name === name);
  if (!agent) return fail('not_found', `agent ${name} not found`);
  return ok<DeployResponse>({ version: (agent.latest_version ?? 0) + 1, status: 'running' });
}
