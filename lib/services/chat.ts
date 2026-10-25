// Chat with the current live version of an agent, against the live system DB.
import * as repo from '../platform/repo';
import { runAgentWith } from '../runtime/runner';
import { liveDb } from '../sysdb/live';
import { validateSpec } from '../spec/validate';
import type { ChatMessage } from '../types';
import type { ChatResponse } from '../contracts/api';
import { ServiceError } from './errors';
import { requireBudget } from './budget';
import { requireAgent } from './agents';
import { looseSpec } from './spec';

/** History sent to the model: at most this many messages, each at most MAX_MESSAGE_CHARS long. */
export const MAX_HISTORY = 12;
export const MAX_MESSAGE_CHARS = 2000;
/** A chat run must finish (and record its spend) before the route's maxDuration (120 s). */
export const CHAT_RUN_MS = 100_000;

/**
 * Validates and trims chat history. Exactly one trailing unanswered user message is allowed (so one request is
 * one model turn); the history is capped to the last MAX_HISTORY messages, each truncated to MAX_MESSAGE_CHARS.
 */
export function prepareHistory(messages: ChatMessage[]): ChatMessage[] {
  const n = messages.length;
  if (n === 0 || messages[n - 1].role !== 'user') throw new ServiceError('bad_request', 'last message must be from the user');
  if (n > 1 && messages[n - 2].role === 'user') {
    throw new ServiceError('bad_request', 'history must end in exactly one unanswered user message');
  }
  let recent = messages.slice(-MAX_HISTORY);
  // Don't start the window on a dangling assistant reply.
  while (recent.length > 1 && recent[0].role === 'assistant') recent = recent.slice(1);
  return recent.map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
}

export async function chat(name: string, messages: ChatMessage[], startedAt = Date.now()): Promise<ChatResponse> {
  const history = prepareHistory(messages);
  const agent = await requireAgent(name);
  if (agent.current_version === null) throw new ServiceError('not_found', `${name} has no live version yet; deploy it first`);
  const v = await repo.getVersion(name, agent.current_version);
  if (!v) throw new ServiceError('not_found', `live version ${agent.current_version} of ${name} is missing`);
  await requireBudget(name);
  let spec;
  try {
    spec = validateSpec(v.spec_yaml, v.scenarios).spec ?? looseSpec(v.spec_yaml);
  } catch {
    spec = looseSpec(v.spec_yaml);
  }
  const r = await runAgentWith(
    { spec, version: v.version, messages: history, db: liveDb(), mode: 'live' },
    { deadline: startedAt + CHAT_RUN_MS },
  );
  return { run_id: r.run_id, reply: r.final_reply, cost_usd: r.cost_usd };
}
