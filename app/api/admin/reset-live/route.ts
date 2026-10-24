import type { ResetLiveResponse } from '@/lib/contracts/api';
import { ok, requireAdmin } from '../../_lib/http';

// W0 STUB: Lane C/E reset sys.* to the 20-account seed.
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  return ok<ResetLiveResponse>({ ok: true });
}
