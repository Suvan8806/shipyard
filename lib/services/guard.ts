// Admin token check + in-memory per-IP token-bucket rate limiter (per warm function instance; good enough for a demo).
import { ServiceError } from './errors';

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
