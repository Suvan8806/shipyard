import { connection, type NextRequest } from 'next/server';
import type { VersionDiff } from '@/lib/contracts/stress';
import { getVersionDiff } from '@/lib/services/diff';
import { ServiceError } from '@/lib/services/errors';
import { handle } from '../../../_lib/http';

// GET /api/agents/:name/diff?from=3&to=4 -> spec line diff + per-scenario status changes.
type Ctx = { params: Promise<{ name: string }> };

const intParam = (v: string | null, field: string): number => {
  if (!v || !/^\d{1,9}$/.test(v)) throw new ServiceError('bad_request', `?${field}= must be a version number`);
  return Number(v);
};

export async function GET(req: NextRequest, ctx: Ctx) {
  await connection();
  const { name } = await ctx.params;
  return handle<VersionDiff>(async () => {
    const q = req.nextUrl.searchParams;
    return getVersionDiff(name, intParam(q.get('from'), 'from'), intParam(q.get('to'), 'to'));
  });
}
