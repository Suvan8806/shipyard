// Chat history validation + capping (H1b) and the deadline passed to the runner (H1c). DB, runner and repo mocked.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../lib/types';

const runAgentWith = vi.fn();
vi.mock('../../lib/runtime/runner', () => ({ runAgentWith: (...a: unknown[]) => runAgentWith(...a) }));
vi.mock('../../lib/platform/repo', () => ({
  getVersion: async () => ({ version: 3, spec_yaml: 'name: support-agent\n', scenarios: [] }),
  totalSpendUsd: async () => 0,
}));
vi.mock('../../lib/services/agents', () => ({ requireAgent: async () => ({ name: 'support-agent', current_version: 3 }) }));
vi.mock('../../lib/services/budget', () => ({ requireBudget: async () => undefined }));
vi.mock('../../lib/sysdb/live', () => ({ liveDb: () => ({ kind: 'live' }) }));

import { CHAT_RUN_MS, MAX_HISTORY, MAX_MESSAGE_CHARS, chat, prepareHistory } from '../../lib/services/chat';

const u = (content: string): ChatMessage => ({ role: 'user', content });
const a = (content: string): ChatMessage => ({ role: 'assistant', content });

beforeEach(() => {
  runAgentWith.mockReset();
  runAgentWith.mockResolvedValue({ run_id: 'r1', final_reply: 'hi', cost_usd: 0.01 });
});

describe('prepareHistory', () => {
  it('accepts a single user message and an alternating history ending in one user message', () => {
    expect(prepareHistory([u('hi')])).toEqual([u('hi')]);
    expect(prepareHistory([u('a'), a('b'), u('c')])).toEqual([u('a'), a('b'), u('c')]);
  });

  it('rejects empty history, a trailing assistant message and two trailing user messages', () => {
    for (const bad of [[], [u('a'), a('b')], [u('a'), u('b')], [u('a'), a('b'), u('c'), u('d')]]) {
      expect(() => prepareHistory(bad)).toThrow(expect.objectContaining({ code: 'bad_request', status: 400 }));
    }
  });

  it('caps history to the last 12 messages and truncates each to 2000 chars', () => {
    const long: ChatMessage[] = [];
    for (let i = 0; i < 30; i++) long.push(i % 2 === 0 ? u(`u${i}`) : a(`a${i}`));
    long.push(u('x'.repeat(5000)));
    // 31 messages, alternating, ending in user: the last 12 start on an assistant reply, which is dropped.
    const out = prepareHistory(long);
    expect(out.length).toBeLessThanOrEqual(MAX_HISTORY);
    expect(out[0].role).toBe('user');
    expect(out[out.length - 1].content).toHaveLength(MAX_MESSAGE_CHARS);
    expect(out.slice(0, -1)).toEqual(long.slice(-out.length, -1));
  });
});

describe('chat', () => {
  it('runs with the capped history and a deadline before maxDuration', async () => {
    const msgs: ChatMessage[] = [];
    for (let i = 0; i < 20; i++) msgs.push(i % 2 === 0 ? u(`u${i}`) : a(`a${i}`));
    msgs.push(u('last'));
    const r = await chat('support-agent', msgs, 1_000);
    expect(r).toEqual({ run_id: 'r1', reply: 'hi', cost_usd: 0.01 });
    const [input, opts] = runAgentWith.mock.calls[0];
    expect(input.messages.length).toBeLessThanOrEqual(MAX_HISTORY);
    expect(input.messages[input.messages.length - 1]).toEqual(u('last'));
    expect(input.mode).toBe('live');
    expect(opts).toEqual({ deadline: 1_000 + CHAT_RUN_MS });
  });

  it('rejects bad history before running the model', async () => {
    await expect(chat('support-agent', [u('a'), u('b')])).rejects.toMatchObject({ code: 'bad_request' });
    expect(runAgentWith).not.toHaveBeenCalled();
  });
});
