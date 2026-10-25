// The ONLY data-access module for the dashboard. Every screen calls these functions.
// Real mode (default): hits the REST routes in lib/contracts/api.ts on the same origin.
// NEXT_PUBLIC_API_ORIGIN=https://shipyard-silk-beta.vercel.app makes local dev talk to that deployment through the
// same-origin dev proxy at /api-proxy/* (app/(dash)/api-proxy/[...path]/route.ts), because the API sends no CORS headers.
// Mock mode (NEXT_PUBLIC_USE_MOCKS=1, for offline demos): fixtures + a fake 300 ms delay, including a simulated
// deploy whose gate cards flip over ~8 s.
import type {
  AgentDetail,
  AgentSummary,
  Approval,
  AuditRow,
  ChatResponse,
  DecisionResponse,
  DeployResponse,
  GenerateTestsResponse,
  LibraryResponse,
  RollbackResponse,
  RunListItem,
  RunTrace,
  SimulateResponse,
  ValidateResponse,
  ApiError,
} from '@/lib/contracts/api';
import type { ChatMessage, GateResult } from '@/lib/types';
import * as mock from './mock';

export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === '1';
/** Set when local dev should read a remote deployment's API (see the header comment). */
export const API_ORIGIN = (process.env.NEXT_PUBLIC_API_ORIGIN ?? '').replace(/\/+$/, '');
const API_PREFIX = API_ORIGIN ? '/api-proxy' : '';
// request() paths start with /api/..., so the proxy receives /api-proxy/api/... and forwards the full path.
const MOCK_DELAY_MS = 300;

export class ApiRequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function mocked<T>(fn: () => T, delay = MOCK_DELAY_MS): Promise<T> {
  await new Promise((r) => setTimeout(r, delay));
  try {
    return fn();
  } catch (e) {
    if (e instanceof mock.MockError) throw new ApiRequestError(e.code, e.message, e.code === 'not_found' ? 404 : 400);
    throw e;
  }
}

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_PREFIX}${path}`, {
      method: init?.method ?? 'GET',
      headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiRequestError('network', 'Could not reach the Shipyard API. Check your connection and retry.', 0);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON body (a platform 502/504 page, a function timeout): report the status, not a parse error.
    data = null;
  }
  if (!res.ok) {
    const err = (data as ApiError | null)?.error;
    const fallback =
      res.status === 504 || res.status === 408
        ? 'The API timed out. Retry in a moment.'
        : res.status >= 500
          ? `The API failed (HTTP ${res.status}). Retry in a moment.`
          : `Request failed (HTTP ${res.status}).`;
    throw new ApiRequestError(err?.code ?? (res.status >= 500 ? 'internal' : 'bad_request'), err?.message ?? fallback, res.status, err?.details);
  }
  if (data === null && text) {
    throw new ApiRequestError('internal', 'The API returned a response the dashboard could not read.', res.status);
  }
  return data as T;
}

/** User-facing message for any thrown value. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

const enc = encodeURIComponent;

// ---------- agents ----------
export function getAgents(): Promise<AgentSummary[]> {
  return USE_MOCKS ? mocked(mock.getAgents) : request('/api/agents');
}

export function getAgent(name: string): Promise<AgentDetail> {
  return USE_MOCKS ? mocked(() => mock.getAgent(name)) : request(`/api/agents/${enc(name)}`);
}

/** Saves the draft spec and returns validation errors (PUT /api/agents/:name/spec). */
export function saveSpec(name: string, specYaml: string): Promise<ValidateResponse> {
  return USE_MOCKS
    ? mocked(() => mock.saveSpec(name, specYaml), 150)
    : request(`/api/agents/${enc(name)}/spec`, { method: 'PUT', body: { spec_yaml: specYaml } });
}

/** Validates the saved draft (spec + scenarios) without changing it. */
export function validate(name: string): Promise<ValidateResponse> {
  return USE_MOCKS
    ? mocked(() => mock.getAgent(name).validation)
    : request(`/api/agents/${enc(name)}/validate`, { method: 'POST' });
}

/** Stage safety net: open the dashboard with ?replay=1 and Deploy replays a cached identical-spec gate (no LLM). */
function replayQuery(): string {
  if (typeof window === 'undefined') return '';
  const v = new URLSearchParams(window.location.search).get('replay');
  return v === '1' || v === 'true' ? '?replay=1' : '';
}

export function deploy(name: string): Promise<DeployResponse> {
  return USE_MOCKS ? mocked(() => mock.deploy(name)) : request(`/api/agents/${enc(name)}/deploy${replayQuery()}`, { method: 'POST' });
}

export function getGate(name: string, version: number): Promise<GateResult> {
  return USE_MOCKS
    ? mocked(() => mock.getGate(name, version), 120)
    : request(`/api/agents/${enc(name)}/versions/${version}`);
}

/** Mock-only demo helper: replays an existing gate as a live animation. No-op against the real API. */
export function replayGate(name: string, version: number): Promise<void> {
  return USE_MOCKS ? mocked(() => mock.replayGate(name, version), 50) : Promise.resolve();
}

export function rollback(name: string): Promise<RollbackResponse> {
  return USE_MOCKS ? mocked(() => mock.rollback(name)) : request(`/api/agents/${enc(name)}/rollback`, { method: 'POST' });
}

export function chat(name: string, messages: ChatMessage[]): Promise<ChatResponse> {
  return USE_MOCKS
    ? mocked(() => mock.chat(name, messages), 900)
    : request(`/api/agents/${enc(name)}/chat`, { method: 'POST', body: { messages } });
}

/** Proposes new scenarios (filename -> YAML). Nothing is saved until acceptGeneratedTests. */
export function generateTests(name: string, count = 10): Promise<GenerateTestsResponse> {
  return USE_MOCKS
    ? mocked(() => mock.generateTests(), 1400)
    : request(`/api/agents/${enc(name)}/generate-tests`, { method: 'POST', body: { count } });
}

/**
 * Accepts proposed scenarios into the draft. The contract has no dedicated route; against the real API this
 * re-creates the agent draft via POST /api/agents with the merged scenarios (Lane C upserts by name).
 */
export async function acceptGeneratedTests(name: string, scenarios: Record<string, string>): Promise<void> {
  if (USE_MOCKS) return mocked(() => mock.acceptScenarios(name, scenarios));
  const d = await getAgent(name);
  await request('/api/agents', {
    method: 'POST',
    body: {
      spec_yaml: d.draft_spec_yaml,
      scenarios: { ...d.draft_scenarios, ...scenarios },
      team: d.team ?? undefined,
      owner: d.owner ?? undefined,
    },
  });
}

// ---------- runs ----------
export function getRuns(opts: { limit?: number; agent?: string } = {}): Promise<RunListItem[]> {
  if (USE_MOCKS) return mocked(() => mock.getRuns(opts), 150);
  const q = new URLSearchParams();
  q.set('limit', String(opts.limit ?? 50));
  if (opts.agent) q.set('agent', opts.agent);
  return request(`/api/runs?${q.toString()}`);
}

export function getRun(id: string): Promise<RunTrace> {
  return USE_MOCKS ? mocked(() => mock.getRun(id)) : request(`/api/runs/${enc(id)}`);
}

// ---------- library / approvals / audit ----------
export function getLibrary(): Promise<LibraryResponse> {
  return USE_MOCKS ? mocked(mock.getLibrary) : request('/api/library');
}

export function getApprovals(status?: Approval['status']): Promise<Approval[]> {
  return USE_MOCKS
    ? mocked(() => mock.getApprovals(status))
    : request(`/api/approvals${status ? `?status=${status}` : ''}`);
}

export function decide(id: number, decision: 'approve' | 'reject'): Promise<DecisionResponse> {
  return USE_MOCKS
    ? mocked(() => mock.decide(id, decision))
    : request(`/api/approvals/${id}`, { method: 'POST', body: { decision } });
}

export function getAudit(): Promise<AuditRow[]> {
  return USE_MOCKS ? mocked(mock.getAudit) : request('/api/audit');
}

// ---------- admin ----------
/**
 * The admin token from the page URL (?token=...), read fresh on every call. Never stored or logged: it only travels
 * as ?token= on the admin calls below, which the API requires (SHIPYARD_RESET_TOKEN).
 */
export function adminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('token') || null;
}

function withAdminToken(path: string): string {
  const t = adminToken();
  return t ? `${path}?token=${enc(t)}` : path;
}

export function simulateTraffic(count = 5): Promise<SimulateResponse> {
  return USE_MOCKS
    ? mocked(() => mock.simulateTraffic(count), 1200)
    : request(withAdminToken('/api/admin/simulate'), { method: 'POST', body: { count } });
}

export function resetLive(): Promise<{ ok: true }> {
  return USE_MOCKS ? mocked(() => ({ ok: true as const })) : request(withAdminToken('/api/admin/reset-live'), { method: 'POST' });
}
