// Per-model prices (PRD 11.3), USD per 1M tokens.
// Groq: console.groq.com/docs/models (checked 2026-10-24). Claude: plans/notes/stack-notes.md section 6.
import { DEFAULT_CAREFUL_MODEL } from '../library/profiles';

export interface Price { in: number; out: number }

export const PRICES: Record<string, Price> = {
  'groq/openai/gpt-oss-20b': { in: 0.075, out: 0.3 },
  'groq/openai/gpt-oss-120b': { in: 0.15, out: 0.6 },
  'anthropic/claude-opus-5-5': { in: 4, out: 20 },
  'anthropic/claude-sonnet-5-5': { in: 2, out: 10 },
  'anthropic/claude-haiku-4-5': { in: 1, out: 5 },
  // Gemini (ai.google.dev/pricing): ESTIMATE, not verified live (no web lookup available during the 2026-10-24
  // integration pass). Re-check before quoting costs; values assume Flash-tier text pricing.
  'google/gemini-3.5-flash': { in: 0.5, out: 3 },
  'google/gemini-3.5-flash-lite': { in: 0.1, out: 0.4 },
};

export function priceOf(model: string): Price {
  return PRICES[model] ?? PRICES[`groq/${model}`] ?? PRICES[`anthropic/${model}`] ?? PRICES[`google/${model}`] ?? PRICES[DEFAULT_CAREFUL_MODEL];
}

export function costOf(model: string, usage: { inputTokens?: number; outputTokens?: number }): number {
  const p = priceOf(model);
  const cost = ((usage.inputTokens ?? 0) * p.in + (usage.outputTokens ?? 0) * p.out) / 1_000_000;
  return Math.round(cost * 1e8) / 1e8;
}
