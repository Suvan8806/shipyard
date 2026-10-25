// H2: POST /api/admin/reset-live and /api/admin/simulate are guarded by SHIPYARD_RESET_TOKEN and fail closed.
import { afterEach, describe, expect, it } from 'vitest';
import { requireResetToken } from '@/lib/services/guard';

const URL_BASE = 'https://shipyard.test/api/admin/reset-live';

function codeOf(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? 'unknown';
  }
}

describe('requireResetToken', () => {
  afterEach(() => {
    delete process.env.SHIPYARD_RESET_TOKEN;
  });

  it('returns 403 (forbidden) when SHIPYARD_RESET_TOKEN is unset, even with a token', () => {
    delete process.env.SHIPYARD_RESET_TOKEN;
    expect(codeOf(() => requireResetToken(new Request(URL_BASE)))).toBe('forbidden');
    expect(codeOf(() => requireResetToken(new Request(`${URL_BASE}?token=anything`)))).toBe('forbidden');
  });

  it('rejects a missing or wrong token with 401', () => {
    process.env.SHIPYARD_RESET_TOKEN = 's3cret-token';
    expect(codeOf(() => requireResetToken(new Request(URL_BASE)))).toBe('unauthorized');
    expect(codeOf(() => requireResetToken(new Request(`${URL_BASE}?token=nope`)))).toBe('unauthorized');
    expect(codeOf(() => requireResetToken(new Request(URL_BASE, { headers: { authorization: 'Bearer s3cret-tokeX' } })))).toBe('unauthorized');
  });

  it('accepts the token as a Bearer header or ?token=', () => {
    process.env.SHIPYARD_RESET_TOKEN = 's3cret-token';
    expect(codeOf(() => requireResetToken(new Request(URL_BASE, { headers: { authorization: 'Bearer s3cret-token' } })))).toBeNull();
    expect(codeOf(() => requireResetToken(new Request(`${URL_BASE}?token=s3cret-token&purge=1`)))).toBeNull();
  });
});
