import { connection } from 'next/server';
import { AUDIT } from '@/lib/mock/fixtures';
import type { AuditRow } from '@/lib/contracts/api';
import { ok } from '../_lib/http';

// W0 STUB.
export async function GET() {
  await connection();
  return ok<AuditRow[]>(AUDIT);
}
