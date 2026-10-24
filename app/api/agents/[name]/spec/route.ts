import { AGENT_DETAIL } from '@/lib/mock/fixtures';
import { PutSpecBody, type ValidateResponse } from '@/lib/contracts/api';
import { validateSpec } from '@/lib/spec/validate';
import { ok, parseBody, requireAdmin } from '../../../_lib/http';

type Ctx = { params: Promise<{ name: string }> };

// W0 STUB: validates but does not persist.
export async function PUT(req: Request, ctx: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  await ctx.params;
  const { data, error } = await parseBody(req, PutSpecBody);
  if (error) return error;
  return ok<ValidateResponse>(validateSpec(data.spec_yaml, AGENT_DETAIL.draft_scenarios));
}
