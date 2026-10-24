import { connection } from 'next/server';
import { AGENTS, AGENT_DETAIL } from '@/lib/mock/fixtures';
import type { AgentDetail } from '@/lib/contracts/api';
import { fail, ok } from '../../_lib/http';

type Ctx = { params: Promise<{ name: string }> };

// W0 STUB: support-agent returns the rich fixture; other known agents get a thin copy.
export async function GET(_req: Request, ctx: Ctx) {
  await connection();
  const { name } = await ctx.params;
  const summary = AGENTS.find((a) => a.name === name);
  if (!summary) return fail('not_found', `agent ${name} not found`);
  if (name === AGENT_DETAIL.name) return ok<AgentDetail>(AGENT_DETAIL);
  return ok<AgentDetail>({
    ...AGENT_DETAIL,
    name,
    team: summary.team,
    owner: summary.owner,
    current_version: summary.current_version,
    draft_spec_yaml: AGENT_DETAIL.draft_spec_yaml.replace('name: support-agent', `name: ${name}`),
  });
}
