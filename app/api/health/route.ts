import { connection } from 'next/server';
import type { HealthResponse } from '@/lib/contracts/api';
import { budgetStatus } from '@/lib/services/budget';

export async function GET() {
  await connection();
  const budget = await budgetStatus();
  return Response.json({ ok: true, ...budget } satisfies HealthResponse & { spend_usd: number | null; budget_usd: number });
}
