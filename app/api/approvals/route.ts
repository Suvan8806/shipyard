import { connection, type NextRequest } from 'next/server';
import { APPROVALS } from '@/lib/mock/fixtures';
import type { Approval } from '@/lib/contracts/api';
import { ok } from '../_lib/http';

// W0 STUB: GET /api/approvals?status=pending
export async function GET(req: NextRequest) {
  await connection();
  const status = req.nextUrl.searchParams.get('status');
  return ok<Approval[]>(APPROVALS.filter((a) => !status || a.status === status));
}
