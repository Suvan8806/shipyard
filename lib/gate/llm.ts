// Model resolution for the gate's own small LLM calls (reply judge, paraphrase variants).
// Uses the shared resolver (lib/runtime/model.ts) so gate and runtime route model strings identically.
import type { LanguageModel } from 'ai';
import { PROFILES } from '../library';
import { resolveModel } from '../runtime/model';

export const FAST_DEFAULT = 'groq/openai/gpt-oss-20b';

export { resolveModel };

/** The `fast` profile model (or an injected override in tests). */
export function fastModel(override?: LanguageModel): LanguageModel {
  if (override) return override;
  return resolveModel(process.env.SHIPYARD_FAST_MODEL ?? PROFILES.fast?.model ?? FAST_DEFAULT);
}
