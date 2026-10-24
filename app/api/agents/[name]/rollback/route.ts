import type { RollbackResponse } from '@/lib/contracts/api';
import { ok, requireAdmin } from '../../../_lib/http';

type Ctx = { params: Promise<{ name: string }> };

// W0 STUB.
export async function POST(req: Request, ctx: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  await ctx.params;
  return ok<RollbackResponse>({ current_version: 1 });
}
