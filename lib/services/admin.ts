// Admin actions: traffic simulation + live reset. Implementations come from Lane E (lib/library/simulate.ts,
// lib/library/reset.ts).
import { simulateTraffic } from '../library/simulate';
import { resetLive } from '../library/reset';
import * as repo from '../platform/repo';
import { requireBudget } from './budget';
import { chat } from './chat';
import { listAgents } from './agents';
import { getRunTrace } from './runs';
import type { ResetLiveResponse, SimulateResponse } from '../contracts/api';

/** Simulated member traffic, in-process: calls the chat service directly (no HTTP, no per-IP chat rate limit). */
export async function simulate(count: number, actor = 'api'): Promise<SimulateResponse> {
  await requireBudget();
  const r = await simulateTraffic(Math.min(Math.max(count, 1), 10), '', {
    direct: {
      chat: (agent, messages) => chat(agent, messages),
      trace: (runId) => getRunTrace(runId),
      liveAgents: async () => (await listAgents()).filter((a) => a.current_version !== null).map((a) => a.name),
    },
  });
  await repo.audit(actor, 'admin.simulate', null, r);
  return r;
}

export async function reset(actor = 'api', opts: { purgeUnseeded?: boolean } = {}): Promise<ResetLiveResponse> {
  const r = await resetLive({ purgeUnseeded: opts.purgeUnseeded ?? true });
  await repo.audit(actor, 'admin.reset_live', null, { purged_agents: r.purged_agents });
  return { ok: true, purged_agents: r.purged_agents };
}
