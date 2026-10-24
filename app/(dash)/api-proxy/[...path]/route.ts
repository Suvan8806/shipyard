// Dev-only same-origin proxy: forwards /api-proxy/<path> to `${NEXT_PUBLIC_API_ORIGIN}/api/<path>` so a local
// `next dev` can render against a deployed API (the API sends no CORS headers). Returns 404 when the env var is unset,
// so it is inert in production.
import type { NextRequest } from 'next/server';

const ORIGIN = (process.env.NEXT_PUBLIC_API_ORIGIN ?? '').replace(/\/+$/, '');

async function forward(req: NextRequest, ctx: RouteContext<'/api-proxy/[...path]'>): Promise<Response> {
  if (!ORIGIN) return Response.json({ error: { code: 'not_found', message: 'Proxy disabled' } }, { status: 404 });
  const { path } = await ctx.params;
  const target = `${ORIGIN}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text();
  try {
    const res = await fetch(target, {
      method: req.method,
      headers: body ? { 'content-type': req.headers.get('content-type') ?? 'application/json' } : undefined,
      body,
      cache: 'no-store',
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
  } catch (e) {
    return Response.json(
      { error: { code: 'internal', message: `Proxy could not reach ${ORIGIN}: ${e instanceof Error ? e.message : String(e)}` } },
      { status: 502 },
    );
  }
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
