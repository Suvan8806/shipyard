// Resolves a profile model string to an AI SDK LanguageModel.
//   "groq/<id>"      -> @ai-sdk/groq (GROQ_API_KEY)
//   "google/<id>"    -> @ai-sdk/google (GOOGLE_GENERATIVE_AI_API_KEY)
//   "anthropic/<id>" -> @ai-sdk/anthropic when ANTHROPIC_API_KEY is set, else the AI Gateway string
//   anything else    -> passed through as an AI Gateway string
//
// Also: createResilientModel, a rate-limit-aware wrapper. On 429/503 it honors retry-after (or Groq's
// "try again in Xs" text), backs off with jitter, and when a model stays throttled falls back to the next model
// in the chain (SHIPYARD_FALLBACK_MODELS). It works per model call, so a mid-turn throttle never re-runs tools.
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

/** True for throttling responses: 429, 503 (overloaded), 529. */
export function isThrottle(e: unknown): boolean {
  const inner = RetryError.isInstance(e) ? e.lastError : e;
  if (!APICallError.isInstance(inner)) return false;
  return inner.statusCode === 429 || inner.statusCode === 503 || inner.statusCode === 529;
}

/** Parses Groq/OpenAI style "try again in 1m2.5s" / "in 450ms" / "in 7.5s" into ms. */
export function parseTryAgainMs(text: string): number | null {
  const m = /try again in\s+((?:\d+(?:\.\d+)?(?:ms|h|m|s))+)/i.exec(text);
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
  const inner = RetryError.isInstance(e) ? e.lastError : e;
  if (!APICallError.isInstance(inner)) return null;
  const h = inner.responseHeaders ?? {};
  const ms = Number(h['retry-after-ms']);
  if (Number.isFinite(ms) && ms > 0) return ms;
  const s = Number(h['retry-after']);
  if (Number.isFinite(s) && s > 0) return s * 1000;
  return parseTryAgainMs(`${inner.message} ${inner.responseBody ?? ''}`);
}

export class RateLimitExhaustedError extends Error {
  constructor(models: string[], waitedMs: number, last: unknown) {
    const lastMsg = (last instanceof Error ? last.message : String(last)).slice(0, 200);
    super(
      `Rate limited on every model in the fallback chain (${models.join(' -> ')}) after ${Math.round(waitedMs / 1000)}s of backoff. Last error: ${lastMsg}`,
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

export interface ResilientOptions {
  /** Per-call backoff budget across the whole chain (default SHIPYARD_RATE_LIMIT_BUDGET_MS or 90s). */
  budgetMs?: number;
  /** Max ms to wait on one model before falling back (default SHIPYARD_RATE_LIMIT_MODEL_BUDGET_MS or 30s). */
  perModelBudgetMs?: number;
  /** Absolute epoch ms after which no more waiting happens (keeps a serverless invocation under its cap). */
  deadline?: number;
  /** Called when a throttled call is retried or falls back (for trace events). */
  onThrottle?: (info: { model: string; waitMs: number | null; fallbackTo: string | null; error: string }) => void;
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
    const first = start;
    for (let i = start; i < models.length; i++) {
      let waitedHere = 0;
      for (let attempt = 0; ; attempt++) {
        try {
          const r = await models[i].m.doGenerate(params);
          start = i;
          state.fallbackFrom = i > 0 ? models[0].id : null;
          state.current = models[i].id;
          return r;
        } catch (e) {
          if (!isThrottle(e)) {
            // A broken fallback (missing key, bad id) is skipped; the model we started on reports its own error.
            if (i === first) throw e;
            last = e;
            break;
          }
          last = e;
          const suggested = suggestedWaitMs(e);
          const backoff = Math.min(2000 * 2 ** attempt, 20_000);
          const wait = Math.round((suggested ?? backoff) * (1 + Math.random() * 0.25)) + 250;
          const timeLeft = opts.deadline ? opts.deadline - Date.now() : Infinity;
          const canWait = waitedHere + wait <= perModel && waited + wait <= budget && wait < timeLeft;
          const next = models[i + 1]?.id ?? null;
          opts.onThrottle?.({ model: models[i].id, waitMs: canWait ? wait : null, fallbackTo: canWait ? null : next, error: errText(e) });
          if (!canWait) break;
          await sleep(wait);
          waited += wait;
          waitedHere += wait;
          state.waitedMs += wait;
        }
      }
    }
    throw new RateLimitExhaustedError(models.slice(first).map((m) => m.id), waited, last);
  };

  const model = wrapLanguageModel({
    model: models[0].m,
    modelId: chain[0].id,
    middleware: { wrapGenerate: async ({ params }) => generate(params) },
  });
  return { model, state };
}

/** A resilient model for a profile model id plus the configured fallback chain. */
export function resilientFor(primary: string, opts: ResilientOptions = {}): { model: LanguageModel; state: ResilientState } {
  const ids = [primary, ...fallbackModelIds(primary)];
  return createResilientModel(ids.map((id) => ({ id, model: resolveModel(id) })), opts);
}
