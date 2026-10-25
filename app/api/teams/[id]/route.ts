import { connection } from 'next/server';
import { listAgents } from '@/lib/services/agents';
import { agentNamesForTeam } from '@/lib/platform/enterprise-repo';
import { getTeam } from '@/lib/services/teams';
import { handle } from '../../_lib/http';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/teams/:id -> TeamSummary + its agents
export async function GET(_req: Request, ctx: Ctx) {
  await connection();
  const { id } = await ctx.params;
  return handle(async () => {
    const team = await getTeam(id);
    const names = new Set(await agentNamesForTeam(id));
    const agents = (await listAgents()).filter((a) => names.has(a.name));
    return { ...team, agent_list: agents };
  });
}
