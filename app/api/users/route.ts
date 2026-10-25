import { connection } from 'next/server';
import { listUsers } from '@/lib/platform/enterprise-repo';
import { GUEST } from '@/lib/enterprise/roles';
import { handle } from '../_lib/http';

// GET /api/users -> demo identities for the "Acting as" switch (guest first)
export async function GET() {
  await connection();
  return handle(async () => [GUEST, ...(await listUsers())]);
}
