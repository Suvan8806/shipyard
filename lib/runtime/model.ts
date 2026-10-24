// Resolves a profile model string to an AI SDK LanguageModel.
//   "groq/<id>"      -> @ai-sdk/groq (GROQ_API_KEY)
//   "google/<id>"    -> @ai-sdk/google (GOOGLE_GENERATIVE_AI_API_KEY)
//   "anthropic/<id>" -> @ai-sdk/anthropic when ANTHROPIC_API_KEY is set, else the AI Gateway string
//   anything else    -> passed through as an AI Gateway string
import type { LanguageModel } from 'ai';
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
