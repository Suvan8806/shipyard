import { connection, type NextRequest } from 'next/server';
import { listAudit } from '@/lib/services/audit';
import { handle } from '../_lib/http';

export async function GET(req: NextRequest) {
  await connection();
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 100) || 100;
  return handle(() => listAudit(limit));
}
