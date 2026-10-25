// Model resolution for the gate's own small LLM calls (reply judge, paraphrase variants).
// Uses the shared resolver (lib/runtime/model.ts) so gate and runtime route model strings identically.
// These calls use the fast profile (Gemini Flash when a Google key is configured), wrapped in the same
// resilient model as agent runs (throttle backoff, dead-provider skip, tool-format retry, missing-key skip) with a
// short backoff budget: they are informational.
import type { LanguageModel } from 'ai';
import { PROFILES } from '../library';
import { resilientFor, resolveModel } from '../runtime/model';

export const FAST_DEFAULT = 'groq/openai/gpt-oss-20b';
export const GEMINI_FAST = 'google/gemini-3.5-flash';

export { resolveModel };

/** The fast-profile model id: SHIPYARD_FAST_MODEL, else Gemini Flash if a Google key is set, else the profile default. */
export function fastModelId(): string {
  if (process.env.SHIPYARD_FAST_MODEL) return process.env.SHIPYARD_FAST_MODEL;
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return GEMINI_FAST;
  return PROFILES.fast?.model ?? FAST_DEFAULT;
}

/** The `fast` profile model (or an injected override in tests). */
export function fastModel(override?: LanguageModel): LanguageModel {
  if (override) return override;
  return resilientFor(fastModelId(), {
    budgetMs: 20_000,
    perModelBudgetMs: 10_000,
    onSkip: (s) => console.warn(`[gate] fast model ${s.reason}: ${s.model}${s.fallbackTo ? ` -> ${s.fallbackTo}` : ''} (${s.error})`),
  }).model;
}
