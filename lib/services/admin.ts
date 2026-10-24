// Admin actions: traffic simulation + live reset. Implementations come from Lane E (lib/library/simulate.ts,
// lib/library/reset.ts). Until they land, ./lane-e-shim provides typed stand-ins with the same names.
// INTEGRATION: when lane-e merges, change the import below to:
//   import { simulateTraffic } from '../library/simulate';
//   import { resetLive } from '../library/reset';
import { resetLive, simulateTraffic } from './lane-e-shim';
import * as repo from '../platform/repo';
import type { ResetLiveResponse, SimulateResponse } from '../contracts/api';

export async function simulate(count: number, origin: string, actor = 'api'): Promise<SimulateResponse> {
  const r = await simulateTraffic(Math.min(Math.max(count, 1), 10), origin);
  await repo.audit(actor, 'admin.simulate', null, r);
  return r;
}

export async function reset(actor = 'api'): Promise<ResetLiveResponse> {
  await resetLive();
  await repo.audit(actor, 'admin.reset_live', null, null);
  return { ok: true };
}
