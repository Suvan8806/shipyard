// TEMPORARY typed shim for Lane E's lib/library/simulate.ts + lib/library/reset.ts (not merged at lane-c build time).
// Delete this file once lane-e is merged and lib/services/admin.ts imports the real modules.
import type { SimulateResponse } from '../contracts/api';
import { ServiceError } from './errors';

export async function simulateTraffic(count: number, origin: string): Promise<SimulateResponse> {
  void count;
  void origin;
  throw new ServiceError('internal', 'traffic simulator not available yet (lane E: lib/library/simulate.ts)');
}

export async function resetLive(): Promise<void> {
  throw new ServiceError('internal', 'live reset not available yet (lane E: lib/library/reset.ts)');
}
