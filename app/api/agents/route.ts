import { connection } from 'next/server';
import { AGENTS } from '@/lib/mock/fixtures';
import { CreateAgentBody, type AgentSummary, type CreateAgentResponse } from '@/lib/contracts/api';
import { validateSpec } from '@/lib/spec/validate';
import { ok, parseBody, requireAdmin } from '../_lib/http';

// W0 STUB: fixture data. Lane C wires to lib/platform/repo.listAgentSummaries.
export async function GET() {
  await connection();
  return ok<AgentSummary[]>(AGENTS);
}

// W0 STUB: validates, does not persist.
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { data, error } = await parseBody(req, CreateAgentBody);
  if (error) return error;
  const v = validateSpec(data.spec_yaml, data.scenarios);
  const name = /^name:\s*([a-z0-9-]+)/m.exec(data.spec_yaml)?.[1] ?? 'unnamed-agent';
  return ok<CreateAgentResponse>({ name, ok: v.ok, errors: v.errors });
}
