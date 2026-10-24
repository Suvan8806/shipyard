import { connection } from 'next/server';
import { LIBRARY } from '@/lib/mock/fixtures';
import type { LibraryResponse } from '@/lib/contracts/api';
import { ok } from '../_lib/http';

// W0 STUB: fixture data. Lane C wires to lib/library.
export async function GET() {
  await connection();
  return ok<LibraryResponse>(LIBRARY);
}
