// Rate-limit resilience: 429 -> backoff (retry-after / "try again in Xs") -> fallback model, recorded in the trace.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APICallError, generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { createResilientModel, parseTryAgainMs, RateLimitExhaustedError, suggestedWaitMs } from '../../lib/runtime/model';
import { createRunner } from '../../lib/runtime/runner';
import type { AgentSpec } from '../../lib/types';
import { DANA, memoryRepo, pgliteDb, seed, type TestDb } from './helpers';

const u = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
const text = (t: string) => ({
  content: [{ type: 'text' as const, text: t }],
  finishReason: { unified: 'stop' as const, raw: 'end_turn' },
  usage: u,
  warnings: [],
});

const tooMany = (headers: Record<string, string> = {}, message = 'Rate limit reached for model openai/gpt-oss-120b. Please try again in 7.5s.') =>
  new APICallError({
    message,
    url: 'https://api.groq.com/openai/v1/chat/completions',
    requestBodyValues: {},
    statusCode: 429,
    responseHeaders: headers,
    isRetryable: true,
  });

/** A mock that always throws 429 (counts its calls). */
function throttled(headers?: Record<string, string>) {
  return new MockLanguageModelV4({
    doGenerate: async () => {
      throw tooMany(headers);
    },
  });
}

const noSleep = async () => undefined;

describe('rate-limit parsing', () => {
  it('parses Groq "try again in" text', () => {
    expect(parseTryAgainMs('Please try again in 7.5s.')).toBe(7500);
    expect(parseTryAgainMs('try again in 1m2.5s')).toBe(62500);
    expect(parseTryAgainMs('try again in 450ms')).toBe(450);
    expect(parseTryAgainMs('nothing here')).toBeNull();
  });
  it('prefers retry-after headers over message text', () => {
    expect(suggestedWaitMs(tooMany({ 'retry-after': '3' }))).toBe(3000);
    expect(suggestedWaitMs(tooMany({ 'retry-after-ms': '120' }))).toBe(120);
    expect(suggestedWaitMs(tooMany())).toBe(7500);
  });
});

describe('createResilientModel', () => {
  it('retries the same model when the wait fits its budget', async () => {
    let n = 0;
    const flaky = new MockLanguageModelV4({
      doGenerate: async () => {
        if (n++ === 0) throw tooMany({ 'retry-after': '1' });
        return text('second try');
      },
    });
    const waits: number[] = [];
    const { model, state } = createResilientModel([{ id: 'groq/a', model: flaky }], {
      sleep: async (ms) => void waits.push(ms),
      perModelBudgetMs: 10_000,
    });
    const r = await generateText({ model, prompt: 'hi', maxRetries: 0 });
    expect(r.text).toBe('second try');
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThanOrEqual(1000); // honored retry-after (plus jitter)
    expect(state.fallbackFrom).toBeNull();
  });

  it('falls back to the next model when the primary stays throttled, and stays there', async () => {
    const primary = throttled();
    const backup = new MockLanguageModelV4({ doGenerate: async () => text('from backup') });
    const throttles: unknown[] = [];
    const { model, state } = createResilientModel(
      [
        { id: 'groq/openai/gpt-oss-120b', model: primary },
        { id: 'google/gemini-3.5-flash', model: backup },
      ],
      { sleep: noSleep, perModelBudgetMs: 5_000, onThrottle: (t) => throttles.push(t) },
    );
    const r = await generateText({ model, prompt: 'hi', maxRetries: 0 });
    expect(r.text).toBe('from backup');
    expect(state).toMatchObject({ current: 'google/gemini-3.5-flash', fallbackFrom: 'groq/openai/gpt-oss-120b' });
    expect(throttles.at(-1)).toMatchObject({ model: 'groq/openai/gpt-oss-120b', fallbackTo: 'google/gemini-3.5-flash', waitMs: null });
    const primaryCalls = primary.doGenerateCalls.length;
    await generateText({ model, prompt: 'again', maxRetries: 0 });
    expect(primary.doGenerateCalls.length).toBe(primaryCalls); // sticky: no new wait on the throttled primary
  });

  it('throws a clear error only after the whole chain is exhausted', async () => {
    const { model } = createResilientModel(
      [
        { id: 'groq/a', model: throttled() },
        { id: 'google/b', model: throttled() },
      ],
      { sleep: noSleep, perModelBudgetMs: 0 },
    );
    const err = await generateText({ model, prompt: 'hi', maxRetries: 0 }).catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitExhaustedError);
    expect(String(err.message)).toMatch(/Rate limited on every model in the fallback chain \(groq\/a -> google\/b\)/);
  });

  it('passes non-throttle errors from the starting model straight through', async () => {
    const broken = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error('bad request');
      },
    });
    const { model } = createResilientModel([{ id: 'x', model: broken }, { id: 'y', model: throttled() }], { sleep: noSleep });
    await expect(generateText({ model, prompt: 'hi', maxRetries: 0 })).rejects.toThrow(/bad request/);
  });
});

describe('runner: 429 -> fallback recorded in the trace', () => {
  const spec: AgentSpec = {
    name: 'support-agent',
    goal: 'Help members.',
    profile: 'careful',
    inherit: [],
    tools: ['accounts.get'],
    instructions: '',
    test_packs: [],
    gate: { min_pass_rate: 1, runs_per_scenario: 1, variants: 0 },
  };
  let db: TestDb;
  beforeAll(async () => {
    db = await pgliteDb();
    await seed(db, { accounts: [DANA] });
  });
  afterAll(async () => {
    await db.close();
  });

  it('model_call event names the fallback model and carries fallback_from', async () => {
    const { repo, events, runs } = memoryRepo();
    const run = createRunner(repo, {
      sleep: noSleep,
      chain: [
        { id: 'groq/openai/gpt-oss-120b', model: throttled() },
        { id: 'google/gemini-3.5-flash', model: new MockLanguageModelV4({ doGenerate: async () => text('Your balance is $412.') }) },
      ],
    });
    const r = await run({ spec, version: 1, messages: [{ role: 'user', content: 'balance?' }], db, mode: 'scenario', scenario: 's' });
    expect(r.outcome).toBe('ok');
    expect(r.final_reply).toBe('Your balance is $412.');
    const mc = events.find((e) => e.type === 'model_call');
    expect(mc?.name).toBe('google/gemini-3.5-flash');
    expect(mc?.payload).toMatchObject({ fallback_from: 'groq/openai/gpt-oss-120b' });
    expect(events.some((e) => e.type === 'error' && e.name === 'rate_limit')).toBe(true);
    expect(runs[0]).toMatchObject({ outcome: 'ok' });
  });

  it('ends the run as error with a clear message when every model is throttled', async () => {
    process.env.SHIPYARD_RATE_LIMIT_MODEL_BUDGET_MS = '0';
    try {
      const { repo, events } = memoryRepo();
      const run = createRunner(repo, {
        sleep: noSleep,
        chain: [
          { id: 'groq/openai/gpt-oss-120b', model: throttled() },
          { id: 'google/gemini-3.5-flash', model: throttled() },
        ],
      });
      const r = await run({ spec, version: 1, messages: [{ role: 'user', content: 'balance?' }], db, mode: 'scenario', scenario: 's' });
      expect(r.outcome).toBe('error');
      const err = events.find((e) => e.type === 'error' && e.name === 'run');
      expect((err?.payload as { error: string }).error).toMatch(/Rate limited on every model/);
    } finally {
      delete process.env.SHIPYARD_RATE_LIMIT_MODEL_BUDGET_MS;
    }
  });
});
