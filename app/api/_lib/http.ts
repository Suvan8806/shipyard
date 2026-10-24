// Small helpers shared by the route handlers (private folder: not routed). Lane C owns app/api/** after W0.
import type { z } from 'zod';
import type { ApiError, ApiErrorCode } from '@/lib/contracts/api';

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  invalid_spec: 409,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function fail(code: ApiErrorCode, message: string, details?: unknown): Response {
  const body: ApiError = { error: { code, message, ...(details === undefined ? {} : { details }) } };
  return Response.json(body, { status: STATUS[code] });
}

/** Parse + validate a JSON body. Returns either { data } or { error: Response }. */
export async function parseBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<{ data: z.infer<S>; error?: never } | { data?: never; error: Response }> {
  let raw: unknown;
  try {
    const text = await req.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    return { error: fail('bad_request', 'body must be valid JSON') };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { error: fail('bad_request', 'invalid request body', parsed.error.issues) };
  }
  return { data: parsed.data };
}

/** Rejects write routes when SHIPYARD_ADMIN_TOKEN is set and the bearer token doesn't match. */
export function requireAdmin(req: Request): Response | null {
  const token = process.env.SHIPYARD_ADMIN_TOKEN;
  if (!token) return null;
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${token}` ? null : fail('unauthorized', 'missing or invalid admin token');
}
