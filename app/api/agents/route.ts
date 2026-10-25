import { connection } from 'next/server';
import { CreateAgentBody } from '@/lib/contracts/api';
import { agentNamesForTeam } from '@/lib/platform/enterprise-repo';
import { createAgent, listAgents } from '@/lib/services/agents';
import { actorOf, body, guard, handle } from '../_lib/http';

// GET /api/agents[?team=<team id>]
export async function GET(req: Request) {
  await connection();
  const team = new URL(req.url).searchParams.get('team');
  return handle(async () => {
    const all = await listAgents();
    if (!team) return all;
    const names = new Set(await agentNamesForTeam(team));
    return all.filter((a) => names.has(a.name));
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    guard(req, 'write');
    const data = await body(req, CreateAgentBody);
    return createAgent(data, actorOf(req));
  });
}
