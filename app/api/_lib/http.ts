// Small helpers shared by the route handlers (private folder: not routed). Lane C owns app/api/** after W0.
import type { z } from 'zod';
import type { ApiError, ApiErrorCode } from '@/lib/contracts/api';
import { ERROR_STATUS, ServiceError, isServiceError } from '@/lib/services/errors';
import { isBudgetExceeded } from '@/lib/runtime/budget';
import { requireAdmin as guardAdmin, rateLimitReq, type LimitBucket } from '@/lib/services/guard';

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function fail(code: ApiErrorCode, message: string, details?: unknown): Response {
  const body: ApiError = { error: { code, message, ...(details === undefined ? {} : { details }) } };
  return Response.json(body, { status: ERROR_STATUS[code] });
}

/** Map any thrown error to the ApiError envelope. */
export function errorResponse(e: unknown): Response {
  if (isServiceError(e)) return fail(e.code, e.message, e.details);
  if (isBudgetExceeded(e)) return fail('budget_exceeded', e.message, { spend_usd: e.spendUsd, budget_usd: e.budgetUsd });
  const message = e instanceof Error ? e.message : String(e);
  console.error('[api] unhandled error:', e);
  return fail('internal', message.includes('SUPABASE_DB_URL') ? 'database is not configured' : 'internal error');
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

/** Parse + validate a JSON body, throwing a 400 ServiceError on failure (for use inside handle()). */
export async function body<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    const text = await req.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new ServiceError('bad_request', 'body must be valid JSON');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ServiceError('bad_request', 'invalid request body', parsed.error.issues);
  return parsed.data;
}

/** Rejects write routes when SHIPYARD_ADMIN_TOKEN is set and the bearer token / sy_admin cookie doesn't match. */
export function requireAdmin(req: Request): Response | null {
  try {
    guardAdmin(req);
    return null;
  } catch (e) {
    return errorResponse(e);
  }
}

/** Admin token + optional per-IP rate limit; throws ServiceError (use inside handle()). */
export function guard(req: Request, bucket?: LimitBucket): void {
  guardAdmin(req);
  if (bucket) rateLimitReq(req, bucket);
}

/** Run a handler body and map thrown ServiceErrors to the error envelope. */
export async function handle<T>(fn: () => Promise<T>, init?: ResponseInit): Promise<Response> {
  try {
    return ok(await fn(), init);
  } catch (e) {
    return errorResponse(e);
  }
}

/** Actor label for audit rows. */
export function actorOf(req: Request): string {
  return req.headers.get('x-shipyard-actor')?.slice(0, 60) || 'dashboard';
}
