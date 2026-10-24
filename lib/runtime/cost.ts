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
};

export function priceOf(model: string): Price {
  return PRICES[model] ?? PRICES[`groq/${model}`] ?? PRICES[`anthropic/${model}`] ?? PRICES[DEFAULT_CAREFUL_MODEL];
}

export function costOf(model: string, usage: { inputTokens?: number; outputTokens?: number }): number {
  const p = priceOf(model);
  const cost = ((usage.inputTokens ?? 0) * p.in + (usage.outputTokens ?? 0) * p.out) / 1_000_000;
  return Math.round(cost * 1e8) / 1e8;
}
