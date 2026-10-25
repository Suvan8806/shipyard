// Resolves a profile model string to an AI SDK LanguageModel.
//   "groq/<id>"      -> @ai-sdk/groq (GROQ_API_KEY)
//   "google/<id>"    -> @ai-sdk/google (GOOGLE_GENERATIVE_AI_API_KEY)
//   "anthropic/<id>" -> @ai-sdk/anthropic when ANTHROPIC_API_KEY is set, else the AI Gateway string
//   anything else    -> passed through as an AI Gateway string
//
// Also: createResilientModel, a rate-limit-aware wrapper. On 429/503 it honors retry-after (or Groq's
// "try again in Xs" text), backs off with jitter, and when a model stays throttled falls back to the next model
// in the chain (SHIPYARD_FALLBACK_MODELS). It works per model call, so a mid-turn throttle never re-runs tools.
// Errors are classified (classifyModelError): DEAD providers (no credits, quota with no retry hint, bad key,
// 401/402/403) are skipped at once and remembered for 10 minutes process-wide; TOOL-FORMAT errors (a mangled
// tool name like "crm_add_note<|channel|>analysis") retry the same call once, then fall through to the next model.
import { APICallError, RetryError, gateway, wrapLanguageModel, type LanguageModel } from 'ai';
import { groq } from '@ai-sdk/groq';
import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';

export function resolveModel(model: string): LanguageModel {
  if (model.startsWith('groq/')) return groq(model.slice('groq/'.length));
  if (model.startsWith('google/')) return google(model.slice('google/'.length));
  if (model.startsWith('anthropic/') && process.env.ANTHROPIC_API_KEY) {
    return anthropic(model.slice('anthropic/'.length));
  }
  return model;
}

// ---------- rate-limit resilience ----------
type V4Model = ReturnType<typeof wrapLanguageModel>;
type GenerateResult = Awaited<ReturnType<V4Model['doGenerate']>>;
type CallOptions = Parameters<V4Model['doGenerate']>[0];

export const DEFAULT_FALLBACK_MODELS = 'google/gemini-3.5-flash,groq/openai/gpt-oss-20b,google/gemini-3.5-flash-lite';

/** Fallback model ids from SHIPYARD_FALLBACK_MODELS (comma separated), without `primary`. */
export function fallbackModelIds(primary: string): string[] {
  const raw = process.env.SHIPYARD_FALLBACK_MODELS ?? DEFAULT_FALLBACK_MODELS;
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set(ids)].filter((id) => id !== primary);
}

const envMs = (name: string, dflt: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
};

const innerOf = (e: unknown) => (RetryError.isInstance(e) ? e.lastError : e);

/** True for throttling responses: 429, 503 (overloaded), 529. */
export function isThrottle(e: unknown): boolean {
  const inner = innerOf(e);
  if (!APICallError.isInstance(inner)) return false;
  return inner.statusCode === 429 || inner.statusCode === 503 || inner.statusCode === 529;
}

/**
 * Parses Groq/OpenAI style "try again in 1m2.5s" / "in 450ms" / "in 7.5s", Gemini's "Please retry in 41.2s" and
 * its RetryInfo `"retryDelay": "41s"` into ms.
 */
export function parseTryAgainMs(text: string): number | null {
  const m =
    /(?:try again|retry) in\s+((?:\d+(?:\.\d+)?(?:ms|h|m|s))+)/i.exec(text) ??
    /"retryDelay"\s*:\s*"((?:\d+(?:\.\d+)?(?:ms|h|m|s))+)"/i.exec(text);
  if (!m) return null;
  let total = 0;
  for (const part of m[1].matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)) {
    const v = Number(part[1]);
    total += part[2] === 'ms' ? v : part[2] === 's' ? v * 1000 : part[2] === 'm' ? v * 60_000 : v * 3_600_000;
  }
  return total > 0 ? Math.ceil(total) : null;
}

/** The server-suggested wait for a throttle error (retry-after-ms, retry-after, or message text), else null. */
export function suggestedWaitMs(e: unknown): number | null {
  const inner = innerOf(e);
  if (!APICallError.isInstance(inner)) return null;
  const h = inner.responseHeaders ?? {};
  const ms = Number(h['retry-after-ms']);
  if (Number.isFinite(ms) && ms > 0) return ms;
  const s = Number(h['retry-after']);
  if (Number.isFinite(s) && s > 0) return s * 1000;
  return parseTryAgainMs(`${inner.message} ${inner.responseBody ?? ''}`);
}

// ---------- error classification ----------
export type ModelErrorKind = 'dead' | 'tool_format' | 'throttle' | 'other';

/** Always fatal for the provider key: no credits, bad key, account-level problems. */
const KEY_DEAD_RE =
  /credits (?:are|have been) depleted|prepayment credits|invalid[ _-]?api[ _-]?key|api key not valid|incorrect api key|API_KEY_INVALID|api key (?:is )?missing|account (?:is )?(?:not active|deactivated|suspended)/i;
/** Quota/billing wording: fatal unless the server also says when to retry (then it's a per-minute throttle). */
const QUOTA_RE = /exceeded your current quota|quota exceeded|insufficient_quota|check your plan and billing|billing details/i;
const TOOL_FORMAT_RE = /tool call validation failed|attempted to call tool|<\|/i;

function errorText(e: unknown): string {
  const inner = innerOf(e);
  if (APICallError.isInstance(inner)) return `${inner.message} ${inner.responseBody ?? ''}`;
  return inner instanceof Error ? inner.message : String(inner);
}

function statusOf(e: unknown): number | undefined {
  const inner = innerOf(e);
  return APICallError.isInstance(inner) ? inner.statusCode : undefined;
}

/**
 * dead: the provider/model cannot serve calls for a while (skip now, remember it).
 * tool_format: the model emitted a malformed tool call (retry once, then next model).
 * throttle: 429/503/529 with a recoverable limit (backoff).
 */
export function classifyModelError(e: unknown): ModelErrorKind {
  const text = errorText(e);
  const status = statusOf(e);
  if (status === 401 || status === 402 || status === 403) return 'dead';
  if (KEY_DEAD_RE.test(text)) return 'dead';
  if (QUOTA_RE.test(text) && suggestedWaitMs(e) === null) return 'dead';
  if (TOOL_FORMAT_RE.test(text)) return 'tool_format';
  if (isThrottle(e)) return 'throttle';
  return 'other';
}

/** Key/account-level deaths (401/402, credits, bad key) kill the whole provider; others (403, quota) one model. */
function deadScope(id: string, e: unknown): string {
  const status = statusOf(e);
  const keyLevel = status === 401 || status === 402 || KEY_DEAD_RE.test(errorText(e));
  const slash = id.indexOf('/');
  return keyLevel && slash > 0 ? `${id.slice(0, slash)}/*` : id;
}

// ---------- process-wide dead-model registry ----------
export const DEAD_TTL_MS = 10 * 60_000;
const dead = new Map<string, { until: number; reason: string }>();

export function markModelDead(key: string, reason: string, now = Date.now()): void {
  dead.set(key, { until: now + DEAD_TTL_MS, reason: reason.slice(0, 300) });
}

/** Why a model (or its whole provider, key `<provider>/*`) is marked dead, or null. Expired marks are dropped. */
export function deadReason(id: string, now = Date.now()): string | null {
  const slash = id.indexOf('/');
  const keys = slash > 0 ? [id, `${id.slice(0, slash)}/*`] : [id];
  for (const key of keys) {
    const d = dead.get(key);
    if (!d) continue;
    if (d.until <= now) {
      dead.delete(key);
      continue;
    }
    return d.reason;
  }
  return null;
}

/** Test helper: forget every dead mark. */
export function resetDeadModels(): void {
  dead.clear();
}

/** The env var a chain entry needs but lacks, or null when it is configured (or not checkable). */
export function missingApiKey(id: string): string | null {
  const env = process.env;
  if (id.startsWith('google/')) return env.GOOGLE_GENERATIVE_AI_API_KEY ? null : 'GOOGLE_GENERATIVE_AI_API_KEY';
  if (id.startsWith('groq/')) return env.GROQ_API_KEY ? null : 'GROQ_API_KEY';
  if (id.startsWith('anthropic/')) {
    // Without a direct key, anthropic/* routes through the AI Gateway (API key, or OIDC on Vercel).
    return env.ANTHROPIC_API_KEY || env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN || env.VERCEL ? null : 'ANTHROPIC_API_KEY';
  }
  return null;
}

export class RateLimitExhaustedError extends Error {
  constructor(models: string[], waitedMs: number, last: unknown, throttled = true) {
    const lastMsg = (last instanceof Error ? last.message : String(last)).slice(0, 200);
    super(
      throttled
        ? `Rate limited on every model in the fallback chain (${models.join(' -> ')}) after ${Math.round(waitedMs / 1000)}s of backoff. Last error: ${lastMsg}`
        : `No model in the fallback chain (${models.join(' -> ')}) could serve the call. Last error: ${lastMsg}`,
    );
    this.name = 'RateLimitExhaustedError';
  }
}

export interface ChainModel {
  id: string;
  model: LanguageModel;
}

export interface ResilientState {
  /** Model id that served the most recent successful call. */
  current: string;
  /** Set when the most recent call was served by a fallback model: the model it fell back from. */
  fallbackFrom: string | null;
  /** Total ms spent sleeping on rate limits. */
  waitedMs: number;
}

export type SkipReason = 'provider_dead' | 'tool_format' | 'no_api_key';
export interface SkipInfo {
  model: string;
  reason: SkipReason;
  /** tool_format only: true when the same model is retried once more. */
  retrying?: boolean;
  fallbackTo: string | null;
  error: string;
}

export interface ThrottleInfo {
  model: string;
  waitMs: number | null;
  fallbackTo: string | null;
  error: string;
}

export interface ResilientOptions {
  /** Per-call backoff budget across the whole chain (default SHIPYARD_RATE_LIMIT_BUDGET_MS or 90s). */
  budgetMs?: number;
  /** Max ms to wait on one model before falling back (default SHIPYARD_RATE_LIMIT_MODEL_BUDGET_MS or 30s). */
  perModelBudgetMs?: number;
  /** Absolute epoch ms after which no more waiting happens (keeps a serverless invocation under its cap). */
  deadline?: number;
  /** Called when a throttled call is retried or falls back (for trace events). */
  onThrottle?: (info: ThrottleInfo) => void;
  /** Called when a model is skipped (dead provider, missing key) or a malformed tool call is retried / given up on. */
  onSkip?: (info: SkipInfo) => void;
  sleep?: (ms: number) => Promise<void>;
}

const toV4 = (m: LanguageModel): V4Model =>
  wrapLanguageModel({ model: typeof m === 'string' ? gateway(m) : (m as Parameters<typeof wrapLanguageModel>[0]['model']), middleware: {} });

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

/**
 * Wraps a chain of models into one LanguageModel. Fallback is sticky for the wrapper's lifetime (one run), so a
 * throttled primary is not re-tried (and re-waited on) every step.
 */
export function createResilientModel(chain: ChainModel[], opts: ResilientOptions = {}): { model: LanguageModel; state: ResilientState } {
  if (!chain.length) throw new Error('createResilientModel needs at least one model');
  const models = chain.map((c) => ({ id: c.id, m: toV4(c.model) }));
  const state: ResilientState = { current: chain[0].id, fallbackFrom: null, waitedMs: 0 };
  let start = 0; // sticky index into the chain
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const generate = async (params: CallOptions): Promise<GenerateResult> => {
    const budget = opts.budgetMs ?? envMs('SHIPYARD_RATE_LIMIT_BUDGET_MS', 90_000);
    const perModel = opts.perModelBudgetMs ?? envMs('SHIPYARD_RATE_LIMIT_MODEL_BUDGET_MS', 30_000);
    let waited = 0;
    let last: unknown = null;
    let throttled = false;
    let firstTried = -1;
    const first = start;
    for (let i = start; i < models.length; i++) {
      const id = models[i].id;
      const next = models[i + 1]?.id ?? null;
      const why = deadReason(id);
      if (why) {
        opts.onSkip?.({ model: id, reason: 'provider_dead', fallbackTo: next, error: `marked dead earlier: ${why}` });
        last ??= new Error(`${id} is unavailable: ${why}`);
        continue;
      }
      if (firstTried < 0) firstTried = i;
      let waitedHere = 0;
      let toolRetries = 0;
      for (let attempt = 0; ; attempt++) {
        try {
          const r = await models[i].m.doGenerate(params);
          start = i;
          state.fallbackFrom = i > 0 ? models[0].id : null;
          state.current = id;
          return r;
        } catch (e) {
          last = e;
          const kind = classifyModelError(e);
          if (kind === 'dead') {
            markModelDead(deadScope(id, e), errText(e));
            opts.onSkip?.({ model: id, reason: 'provider_dead', fallbackTo: next, error: errText(e) });
            break;
          }
          if (kind === 'tool_format') {
            const retrying = toolRetries++ < 1;
            opts.onSkip?.({ model: id, reason: 'tool_format', retrying, fallbackTo: retrying ? null : next, error: errText(e) });
            if (retrying) continue;
            break;
          }
          if (kind === 'other') {
            // 413: request bigger than this model's per-minute token limit (Groq free tier); a bigger model may fit.
            if (statusOf(e) === 413) {
              opts.onThrottle?.({ model: id, waitMs: null, fallbackTo: next, error: errText(e) });
              break;
            }
            // A broken fallback (bad id) is skipped; the model we started on reports its own error.
            if (i === firstTried) throw e;
            break;
          }
          throttled = true;
          const suggested = suggestedWaitMs(e);
          const backoff = Math.min(2000 * 2 ** attempt, 20_000);
          const wait = Math.round((suggested ?? backoff) * (1 + Math.random() * 0.25)) + 250;
          const timeLeft = opts.deadline ? opts.deadline - Date.now() : Infinity;
          const canWait = waitedHere + wait <= perModel && waited + wait <= budget && wait < timeLeft;
          opts.onThrottle?.({ model: id, waitMs: canWait ? wait : null, fallbackTo: canWait ? null : next, error: errText(e) });
          if (!canWait) break;
          await sleep(wait);
          waited += wait;
          waitedHere += wait;
          state.waitedMs += wait;
        }
      }
    }
    throw new RateLimitExhaustedError(models.slice(first).map((m) => m.id), waited, last, throttled);
  };

  const model = wrapLanguageModel({
    model: models[0].m,
    modelId: chain[0].id,
    middleware: { wrapGenerate: async ({ params }) => generate(params) },
  });
  return { model, state };
}

/** A resilient model for a profile model id plus the configured fallback chain, minus entries with no API key. */
export function resilientFor(primary: string, opts: ResilientOptions = {}): { model: LanguageModel; state: ResilientState } {
  const all = [primary, ...fallbackModelIds(primary)];
  const ids = all.filter((id, i) => {
    const missing = missingApiKey(id);
    if (!missing) return true;
    opts.onSkip?.({ model: id, reason: 'no_api_key', fallbackTo: all[i + 1] ?? null, error: `${missing} is not set` });
    return false;
  });
  // Nothing configured at all: keep the primary so its own error surfaces.
  if (!ids.length) ids.push(primary);
  return createResilientModel(ids.map((id) => ({ id, model: resolveModel(id) })), opts);
}
