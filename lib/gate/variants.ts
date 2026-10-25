// Paraphrase variants (PRD 10.5 #3): gate.variants = N rewrites each scenario's user turns N ways with the
// fast model. Each variant runs on its own twin with the same setup and assertions. Cached by content hash.
import { createHash } from 'node:crypto';
import { generateText, Output, type LanguageModel } from 'ai';
import { z } from 'zod';
import type { Scenario } from '../types';
import { assertBudget } from '../runtime/budget';
import { fastModel } from './llm';

export const MAX_VARIANTS = 3;
const cache = new Map<string, string[][]>();

const hashOf = (turns: string[], n: number) =>
  createHash('sha256').update(JSON.stringify({ turns, n })).digest('hex');

/** `<name>~v<i>` (keeps any `<pack>/` prefix, so source inference still works). */
export const variantName = (name: string, i: number) => `${name}~v${i}`;

async function paraphrase(turns: string[], n: number, model?: LanguageModel): Promise<string[][]> {
  const key = hashOf(turns, n);
  const hit = cache.get(key);
  if (hit) return hit;
  if (!model) await assertBudget(); // over budget -> throws -> makeVariants yields no variants
  const schema = z.object({ variants: z.array(z.array(z.string())) });
  const { output } = await generateText({
    model: fastModel(model),
    output: Output.object({ schema }),
    temperature: 0.7,
    maxOutputTokens: 1500,
    instructions:
      'Rewrite a customer conversation in different words. Keep every fact, number, account id, name, email address ' +
      'and the intent of each turn exactly. Change only phrasing and tone. Return the same number of turns per variant.',
    prompt: `Produce ${n} variants. Turns (JSON): ${JSON.stringify(turns)}`,
  });
  const variants = (output?.variants ?? []).filter((v) => v.length === turns.length).slice(0, n);
  cache.set(key, variants);
  return variants;
}

/** Variants for one scenario (excluding the original). Errors yield no variants rather than failing the gate. */
export async function makeVariants(s: Scenario, n: number, model?: LanguageModel): Promise<Scenario[]> {
  const count = Math.min(Math.max(Math.floor(n || 0), 0), MAX_VARIANTS);
  if (!count || !s.conversation.length) return [];
  try {
    const turns = s.conversation.map((t) => t.user);
    const variants = await paraphrase(turns, count, model);
    return variants.map((v, i) => ({
      ...s,
      name: variantName(s.name, i + 1),
      description: `${s.description} (paraphrase ${i + 1})`,
      conversation: v.map((user) => ({ user })),
    }));
  } catch {
    return [];
  }
}

export async function expandVariants(scenarios: Scenario[], n: number, model?: LanguageModel): Promise<Scenario[]> {
  if (!n) return scenarios;
  const extra = await Promise.all(scenarios.map((s) => makeVariants(s, n, model)));
  return scenarios.flatMap((s, i) => [s, ...extra[i]]);
}
