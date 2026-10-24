// Model profiles (PRD 8.1). Model strings: "groq/<id>", "anthropic/<id>" or an AI Gateway id.
import type { ModelProfile } from '../types';

export const DEFAULT_FAST_MODEL = 'groq/openai/gpt-oss-20b';
export const DEFAULT_CAREFUL_MODEL = 'groq/openai/gpt-oss-120b';

export const PROFILES: Record<string, ModelProfile> = {
  fast: { model: process.env.SHIPYARD_FAST_MODEL || DEFAULT_FAST_MODEL, temperature: 0.3, maxOutputTokens: 800 },
  careful: {
    model: process.env.SHIPYARD_CAREFUL_MODEL || DEFAULT_CAREFUL_MODEL,
    temperature: 0,
    maxOutputTokens: 1200,
  },
};
