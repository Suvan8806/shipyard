import { connection, type NextRequest } from 'next/server';
import { RUNS } from '@/lib/mock/fixtures';
import type { RunListItem } from '@/lib/contracts/api';
import { ok } from '../_lib/http';

// W0 STUB: GET /api/runs?limit=50&agent=x
export async function GET(req: NextRequest) {
  await connection();
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit') ?? 50) || 50, 1), 200);
  const agent = req.nextUrl.searchParams.get('agent');
  const rows = RUNS.filter((r) => !agent || r.agent === agent).slice(0, limit);
  return ok<RunListItem[]>(rows);
}
