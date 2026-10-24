import { AGENT_DETAIL } from '@/lib/mock/fixtures';
import type { ValidateResponse } from '@/lib/contracts/api';
import { validateSpec } from '@/lib/spec/validate';
import { ok } from '../../../_lib/http';

type Ctx = { params: Promise<{ name: string }> };

// W0 STUB: validates the fixture draft.
export async function POST(_req: Request, ctx: Ctx) {
  await ctx.params;
  const v = validateSpec(AGENT_DETAIL.draft_spec_yaml, AGENT_DETAIL.draft_scenarios);
  return ok<ValidateResponse>({ ok: v.ok, errors: v.errors });
}
