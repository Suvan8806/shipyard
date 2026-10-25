// Error classification in the resilient model: dead provider -> immediate skip (remembered process-wide),
// malformed tool call -> retry once then next model, throttle -> backoff. Plus the trace events the runner writes.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { APICallError, generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import {
  DEAD_TTL_MS,
  classifyModelError,
  createResilientModel,
  deadReason,
  markModelDead,
  resetDeadModels,
  resilientFor,
  type SkipInfo,
} from '../../lib/runtime/model';
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

const apiError = (statusCode: number, message: string, headers: Record<string, string> = {}) =>
  new APICallError({ message, url: 'https://example.test', requestBodyValues: {}, statusCode, responseHeaders: headers, isRetryable: statusCode === 429 });

const DEPLETED = () => apiError(429, 'Your prepayment credits are depleted. Please go to AI Studio to manage your project and billing.');
const QUOTA_NO_HINT = () => apiError(429, 'You exceeded your current quota, please check your plan and billing details.');
const QUOTA_WITH_HINT = () => apiError(429, 'You exceeded your current quota, please check your plan and billing details. Please retry in 41.2s.');
const TOOL_FORMAT = () =>
  apiError(400, "Tool call validation failed: attempted to call tool 'crm_add_note<|channel|>analysis' which was not in request.tools");
const GROQ_TPM = () =>
  apiError(
    429,
    'Rate limit reached for model `openai/gpt-oss-20b` on tokens per minute (TPM): Limit 8000, Used 7000, Requested 2000. Please try again in 7.5s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing',
  );

function failing(make: () => Error) {
  return new MockLanguageModelV4({
    doGenerate: async () => {
      throw make();
    },
  });
}
const ok = (t: string) => new MockLanguageModelV4({ doGenerate: async () => text(t) });
const noSleep = async () => undefined;

afterEach(() => resetDeadModels());

describe('classifyModelError', () => {
  it('treats depleted credits, quota without a retry hint, bad keys and 401/402/403 as dead', () => {
    expect(classifyModelError(DEPLETED())).toBe('dead');
    expect(classifyModelError(QUOTA_NO_HINT())).toBe('dead');
    expect(classifyModelError(apiError(400, 'API key not valid. Please pass a valid API key.'))).toBe('dead');
    expect(classifyModelError(apiError(401, 'Invalid API Key'))).toBe('dead');
    expect(classifyModelError(apiError(402, 'Payment required'))).toBe('dead');
    expect(classifyModelError(apiError(403, 'forbidden'))).toBe('dead');
  });
  it('treats mangled tool names as tool_format', () => {
    expect(classifyModelError(TOOL_FORMAT())).toBe('tool_format');
    expect(classifyModelError(new Error("attempted to call tool 'x<|channel|>commentary'"))).toBe('tool_format');
  });
  it('keeps recoverable limits as throttles', () => {
    expect(classifyModelError(GROQ_TPM())).toBe('throttle');
    expect(classifyModelError(QUOTA_WITH_HINT())).toBe('throttle');
    expect(classifyModelError(apiError(503, 'overloaded'))).toBe('throttle');
  });
  it('leaves everything else as other', () => {
    expect(classifyModelError(new Error('bad request'))).toBe('other');
    expect(classifyModelError(apiError(400, 'invalid temperature'))).toBe('other');
  });
});

describe('dead-model registry', () => {
  it('expires marks after the TTL', () => {
    const t0 = 1_000_000;
    markModelDead('google/*', 'credits depleted', t0);
    expect(deadReason('google/gemini-3.5-flash', t0 + 1000)).toMatch(/credits/);
    expect(deadReason('groq/openai/gpt-oss-20b', t0 + 1000)).toBeNull();
    expect(deadReason('google/gemini-3.5-flash', t0 + DEAD_TTL_MS + 1)).toBeNull();
  });
});

describe('createResilientModel error handling', () => {
  it('skips a dead provider immediately (no backoff) and keeps skipping it in later runs', async () => {
    const gemini = failing(DEPLETED);
    const lite = ok('lite should be skipped too');
    const groq = ok('from groq');
    const sleeps: number[] = [];
    const skips: SkipInfo[] = [];
    const chain = () => [
      { id: 'google/gemini-3.5-flash', model: gemini },
      { id: 'google/gemini-3.5-flash-lite', model: lite },
      { id: 'groq/openai/gpt-oss-20b', model: groq },
    ];
    const opts = { sleep: async (ms: number) => void sleeps.push(ms), onSkip: (s: SkipInfo) => skips.push(s) };

    const first = createResilientModel(chain(), opts);
    const r = await generateText({ model: first.model, prompt: 'hi', maxRetries: 0 });
    expect(r.text).toBe('from groq');
    expect(sleeps).toEqual([]);
    expect(gemini.doGenerateCalls).toHaveLength(1);
    expect(lite.doGenerateCalls).toHaveLength(0); // credits are per key: the whole provider is dead
    expect(skips[0]).toMatchObject({ model: 'google/gemini-3.5-flash', reason: 'provider_dead', fallbackTo: 'google/gemini-3.5-flash-lite' });

    // A different run (new wrapper, same process) never calls the dead provider.
    const second = createResilientModel(chain(), opts);
    await generateText({ model: second.model, prompt: 'again', maxRetries: 0 });
    expect(gemini.doGenerateCalls).toHaveLength(1);
    expect(skips.filter((s) => s.reason === 'provider_dead').length).toBeGreaterThanOrEqual(3);
  });

  it('a dead primary does not throw when a fallback works (unlike other errors)', async () => {
    const { model, state } = createResilientModel(
      [
        { id: 'groq/a', model: failing(() => apiError(401, 'Invalid API Key')) },
        { id: 'other/b', model: ok('b') },
      ],
      { sleep: noSleep },
    );
    expect((await generateText({ model, prompt: 'hi', maxRetries: 0 })).text).toBe('b');
    expect(state).toMatchObject({ current: 'other/b', fallbackFrom: 'groq/a' });
  });

  it('retries a malformed tool call once on the same model, then moves to the next model', async () => {
    const a = failing(TOOL_FORMAT);
    const skips: SkipInfo[] = [];
    const { model, state } = createResilientModel(
      [
        { id: 'groq/openai/gpt-oss-20b', model: a },
        { id: 'groq/openai/gpt-oss-120b', model: ok('from 120b') },
      ],
      { sleep: noSleep, onSkip: (s) => skips.push(s) },
    );
    const r = await generateText({ model, prompt: 'hi', maxRetries: 0 });
    expect(r.text).toBe('from 120b');
    expect(a.doGenerateCalls).toHaveLength(2);
    expect(skips.map((s) => [s.reason, s.retrying])).toEqual([
      ['tool_format', true],
      ['tool_format', false],
    ]);
    expect(state.current).toBe('groq/openai/gpt-oss-120b');
    expect(deadReason('groq/openai/gpt-oss-20b')).toBeNull(); // not dead, just flaky
  });

  it('a malformed tool call that succeeds on retry stays on the same model', async () => {
    let n = 0;
    const flaky = new MockLanguageModelV4({
      doGenerate: async () => {
        if (n++ === 0) throw TOOL_FORMAT();
        return text('clean retry');
      },
    });
    const backup = ok('backup');
    const { model, state } = createResilientModel([{ id: 'groq/a', model: flaky }, { id: 'groq/b', model: backup }], { sleep: noSleep });
    expect((await generateText({ model, prompt: 'hi', maxRetries: 0 })).text).toBe('clean retry');
    expect(backup.doGenerateCalls).toHaveLength(0);
    expect(state.fallbackFrom).toBeNull();
  });

  it('throttles still back off on the same model', async () => {
    let n = 0;
    const flaky = new MockLanguageModelV4({
      doGenerate: async () => {
        if (n++ === 0) throw GROQ_TPM();
        return text('after backoff');
      },
    });
    const sleeps: number[] = [];
    const { model } = createResilientModel([{ id: 'groq/a', model: flaky }], {
      sleep: async (ms) => void sleeps.push(ms),
      perModelBudgetMs: 20_000,
    });
    expect((await generateText({ model, prompt: 'hi', maxRetries: 0 })).text).toBe('after backoff');
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(7500);
  });

  it('reports a non-rate-limit message when every model is dead', async () => {
    const { model } = createResilientModel(
      [
        { id: 'google/a', model: failing(DEPLETED) },
        { id: 'groq/b', model: failing(() => apiError(401, 'Invalid API Key')) },
      ],
      { sleep: noSleep },
    );
    const err = await generateText({ model, prompt: 'hi', maxRetries: 0 }).catch((e) => e);
    expect(String(err.message)).toMatch(/No model in the fallback chain \(google\/a -> groq\/b\) could serve the call/);
  });
});

describe('resilientFor', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('drops chain entries whose provider has no API key', () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    process.env.GROQ_API_KEY = 'test-key';
    process.env.SHIPYARD_FALLBACK_MODELS = 'google/gemini-3.5-flash,groq/openai/gpt-oss-120b';
    const skips: SkipInfo[] = [];
    const { state } = resilientFor('groq/openai/gpt-oss-20b', { onSkip: (s) => skips.push(s) });
    expect(state.current).toBe('groq/openai/gpt-oss-20b');
    expect(skips).toEqual([
      expect.objectContaining({ model: 'google/gemini-3.5-flash', reason: 'no_api_key', error: 'GOOGLE_GENERATIVE_AI_API_KEY is not set' }),
    ]);
  });
});

describe('runner trace: provider_dead / tool_format events', () => {
  const spec: AgentSpec = {
    name: 'collections-agent',
    goal: 'Help members.',
    profile: 'fast',
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

  it('logs each skip as an error event the trace can show', async () => {
    const { repo, events } = memoryRepo();
    const run = createRunner(repo, {
      sleep: noSleep,
      chain: [
        { id: 'google/gemini-3.5-flash', model: failing(DEPLETED) },
        { id: 'groq/openai/gpt-oss-20b', model: failing(TOOL_FORMAT) },
        { id: 'groq/openai/gpt-oss-120b', model: ok('Your balance is $412.') },
      ],
    });
    const r = await run({ spec, version: 1, messages: [{ role: 'user', content: 'balance?' }], db, mode: 'scenario', scenario: 's' });
    expect(r.outcome).toBe('ok');
    const names = events.filter((e) => e.type === 'error').map((e) => e.name);
    expect(names).toEqual(['provider_dead', 'tool_format', 'tool_format']);
    expect(events.find((e) => e.name === 'provider_dead')?.payload).toMatchObject({ model: 'google/gemini-3.5-flash', reason: 'provider_dead' });
    expect(events.find((e) => e.type === 'model_call')?.name).toBe('groq/openai/gpt-oss-120b');
  });
});
