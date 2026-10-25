import { connection } from 'next/server';
import { resolveUser } from '@/lib/services/authz';
import { handle } from '../_lib/http';

// GET /api/me -> the identity from X-Shipyard-User (no header = guest)
export async function GET(req: Request) {
  await connection();
  return handle(() => resolveUser(req));
}
