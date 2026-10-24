import { connection } from 'next/server';
import type { HealthResponse } from '@/lib/contracts/api';

export async function GET() {
  await connection();
  return Response.json({ ok: true } satisfies HealthResponse);
}
