import { connection } from 'next/server';
import { getLibrary } from '@/lib/services/library';
import { handle } from '../_lib/http';

export async function GET() {
  await connection();
  return handle(() => getLibrary());
}
