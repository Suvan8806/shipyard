// HTTP client for the Shipyard REST API (PRD 13). Uses the global fetch so scripts/try-cli.ts can mock it.
// Errors become ApiCallError (status + code + message + details); non-JSON bodies (e.g. a Next 404 page) are tolerated.

export const DEFAULT_API_URL = 'https://shipyard-silk-beta.vercel.app';

export class ApiCallError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface ClientOptions {
  baseUrl: string;
  token?: string;
  /** Vercel deployment-protection bypass secret (preview deploys). */
  bypass?: string;
}

export interface Client {
  baseUrl: string;
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
}

export function resolveBaseUrl(flag?: string): string {
  return (flag || process.env.SHIPYARD_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');
}

export function createClient(opts: ClientOptions): Client {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'x-shipyard-actor': 'cli', accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.bypass) headers['x-vercel-protection-bypass'] = opts.bypass;
    let res: Response;
    try {
      res = await fetch(`${opts.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      const cause = e instanceof Error ? e.message : String(e);
      throw new ApiCallError(0, 'network', `could not reach ${opts.baseUrl} (${cause})`);
    }
    const text = await res.text();
    let data: unknown = undefined;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined;
    }
    if (!res.ok) {
      const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error;
      // No JSON error envelope on a 404 means the route itself does not exist on this server (older deploy).
      const code = err?.code ?? (res.status === 404 ? 'route_not_found' : httpCode(res.status));
      throw new ApiCallError(res.status, code, err?.message ?? (res.statusText || `HTTP ${res.status}`), err?.details);
    }
    if (data === undefined && text) throw new ApiCallError(res.status, 'bad_response', `expected JSON from ${path}, got ${text.slice(0, 60)}…`);
    return data as T;
  }
  return {
    baseUrl: opts.baseUrl,
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b),
    put: (p, b) => call('PUT', p, b),
  };
}

function httpCode(status: number): string {
  if (status === 404) return 'not_found';
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 402) return 'budget_exceeded';
  if (status === 429) return 'rate_limited';
  return status >= 500 ? 'internal' : 'bad_request';
}

export const enc = encodeURIComponent;
