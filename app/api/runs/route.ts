import { connection, type NextRequest } from 'next/server';
import { listRuns } from '@/lib/services/runs';
import { handle } from '../_lib/http';

// GET /api/runs?limit=50&agent=x&mode=live|scenario
export async function GET(req: NextRequest) {
  await connection();
  const p = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(p.get('limit') ?? 50) || 50, 1), 200);
  const agent = p.get('agent') ?? undefined;
  const modeParam = p.get('mode');
  const mode = modeParam === 'live' || modeParam === 'scenario' ? modeParam : undefined;
  return handle(() => listRuns({ limit, agent, mode }));
}
