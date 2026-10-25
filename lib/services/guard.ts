// Admin token check + in-memory per-IP token-bucket rate limiter (per warm function instance; good enough for a demo).
import { timingSafeEqual } from 'node:crypto';
import { ServiceError } from './errors';

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Guards the destructive/paid admin routes (POST /api/admin/reset-live, POST /api/admin/simulate) with
 * SHIPYARD_RESET_TOKEN, sent as `Authorization: Bearer <t>` or `?token=<t>`. Fails closed: when the env var is
 * unset these routes return 403. Independent of SHIPYARD_ADMIN_TOKEN (chat, deploy and spec edits stay public).
 */
export function requireResetToken(req: Request): void {
  const expected = process.env.SHIPYARD_RESET_TOKEN;
  if (!expected) throw new ServiceError('forbidden', 'admin routes are disabled (SHIPYARD_RESET_TOKEN is not set)');
  const header = req.headers.get('authorization') ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  let query = '';
  try {
    query = new URL(req.url).searchParams.get('token') ?? '';
  } catch {
    /* malformed URL: header only */
  }
  if ((bearer && sameSecret(bearer, expected)) || (query && sameSecret(query, expected))) return;
  throw new ServiceError('unauthorized', 'missing or invalid reset token');
}

/** Throws 401 when SHIPYARD_ADMIN_TOKEN is set and neither `Authorization: Bearer <t>` nor cookie `sy_admin=<t>` matches. */
export function requireAdmin(req: Request): void {
  const token = process.env.SHIPYARD_ADMIN_TOKEN;
  if (!token) return;
  const header = req.headers.get('authorization') ?? '';
  if (header === `Bearer ${token}`) return;
  const cookie = req.headers.get('cookie') ?? '';
  const match = /(?:^|;\s*)sy_admin=([^;]+)/.exec(cookie);
  if (match && decodeURIComponent(match[1]) === token) return;
  throw new ServiceError('unauthorized', 'missing or invalid admin token');
}

export function isAdminTokenValid(token: string | undefined): boolean {
  const expected = process.env.SHIPYARD_ADMIN_TOKEN;
  if (!expected) return true;
  return token === expected;
}

export type LimitBucket = 'chat' | 'deploy' | 'generate' | 'simulate' | 'write' | 'mcp';

/** Requests per minute per IP, per bucket. */
const LIMITS: Record<LimitBucket, { capacity: number; perMinute: number }> = {
  chat: { capacity: 10, perMinute: 10 },
  deploy: { capacity: 5, perMinute: 3 },
  generate: { capacity: 3, perMinute: 2 },
  simulate: { capacity: 2, perMinute: 1 },
  write: { capacity: 30, perMinute: 30 },
  mcp: { capacity: 60, perMinute: 60 },
};

interface Bucket { tokens: number; updated: number }
const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'local';
}

/** Throws 429 when the caller exhausted its bucket. Pure in-memory; resets on cold start. */
export function rateLimit(key: string, bucket: LimitBucket, now = Date.now()): void {
  const { capacity, perMinute } = LIMITS[bucket];
  const id = `${bucket}:${key}`;
  const b = buckets.get(id) ?? { tokens: capacity, updated: now };
  const refilled = Math.min(capacity, b.tokens + ((now - b.updated) / 60_000) * perMinute);
  if (refilled < 1) {
    buckets.set(id, { tokens: refilled, updated: now });
    const waitS = Math.ceil(((1 - refilled) / perMinute) * 60);
    throw new ServiceError('rate_limited', `rate limit for ${bucket} exceeded; retry in ~${waitS}s`);
  }
  if (buckets.size > MAX_KEYS) buckets.clear();
  buckets.set(id, { tokens: refilled - 1, updated: now });
}

export function rateLimitReq(req: Request, bucket: LimitBucket): void {
  rateLimit(clientIp(req), bucket);
}
