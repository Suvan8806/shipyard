import { connection } from 'next/server';
import { listTeams } from '@/lib/services/teams';
import { handle } from '../_lib/http';

// GET /api/teams -> TeamSummary[] (agents, spend this month, budget, budget_state)
export async function GET() {
  await connection();
  return handle(() => listTeams());
}
