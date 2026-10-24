// Model resolution for the gate's own small LLM calls (reply judge, paraphrase variants).
// Profile model strings look like 'groq/openai/gpt-oss-20b' (direct Groq) or any gateway id.
import type { LanguageModel } from 'ai';
import { groq } from '@ai-sdk/groq';
import { PROFILES } from '../library';

export const FAST_DEFAULT = 'groq/openai/gpt-oss-20b';

export function resolveModel(id: string): LanguageModel {
  if (id.startsWith('groq/')) return groq(id.slice('groq/'.length));
  return id; // gateway string
}

/** The `fast` profile model (or an injected override in tests). */
export function fastModel(override?: LanguageModel): LanguageModel {
  if (override) return override;
  return resolveModel(process.env.SHIPYARD_FAST_MODEL ?? PROFILES.fast?.model ?? FAST_DEFAULT);
}
