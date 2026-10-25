import { z } from 'zod';
import { resolveUser } from '@/lib/services/authz';
import { setBudget } from '@/lib/services/teams';
import { body, guard, handle } from '../../../_lib/http';

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ monthly_budget_usd: z.number().nullable() });

// PUT /api/teams/:id/budget {monthly_budget_usd} (admin only)
export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return handle(async () => {
    guard(req, 'write');
    const data = await body(req, Body);
    return setBudget(await resolveUser(req), id, data.monthly_budget_usd);
  });
}
