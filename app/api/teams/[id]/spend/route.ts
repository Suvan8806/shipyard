import { connection } from 'next/server';
import { getTeam } from '@/lib/services/teams';
import { handle } from '../../../_lib/http';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/teams/:id/spend -> {team, spend_usd, monthly_budget_usd, budget_state}
export async function GET(_req: Request, ctx: Ctx) {
  await connection();
  const { id } = await ctx.params;
  return handle(async () => {
    const t = await getTeam(id);
    return { team: t.id, spend_usd: t.spend_usd, monthly_budget_usd: t.monthly_budget_usd, budget_state: t.budget_state };
  });
}
