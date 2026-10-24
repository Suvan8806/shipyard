import { connection, type NextRequest } from 'next/server';
import { listApprovals, parseStatus } from '@/lib/services/approvals';
import { handle } from '../_lib/http';

// GET /api/approvals?status=pending
export async function GET(req: NextRequest) {
  await connection();
  return handle(async () => listApprovals(parseStatus(req.nextUrl.searchParams.get('status'))));
}
