import { connection } from 'next/server';
import { AGENTS, GATE_BLOCKED, GATE_LIVE, GATE_RUNNING } from '@/lib/mock/fixtures';
import type { GateResponse } from '@/lib/contracts/api';
import { fail, ok } from '../../../../_lib/http';

type Ctx = { params: Promise<{ name: string; v: string }> };

// W0 STUB: support-agent v1 = live, v2 = blocked, v3 = running; other agents get the live fixture.
export async function GET(_req: Request, ctx: Ctx) {
  await connection();
  const { name, v } = await ctx.params;
  const version = Number(v);
  if (!Number.isInteger(version) || version < 1) return fail('bad_request', 'version must be a positive integer');
  if (!AGENTS.some((a) => a.name === name)) return fail('not_found', `agent ${name} not found`);
  if (name === 'support-agent') {
    if (version === 1) return ok<GateResponse>(GATE_LIVE);
    if (version === 2) return ok<GateResponse>(GATE_BLOCKED);
    if (version === 3) return ok<GateResponse>({ ...GATE_RUNNING, version: 3 });
    return fail('not_found', `version ${version} not found`);
  }
  return ok<GateResponse>({ ...GATE_LIVE, agent: name, version, current_version: version });
}
