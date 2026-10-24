// Chat with the current live version of an agent, against the live system DB.
import * as repo from '../platform/repo';
import { runAgent } from '../runtime/runner';
import { liveDb } from '../sysdb/live';
import { validateSpec } from '../spec/validate';
import type { ChatMessage } from '../types';
import type { ChatResponse } from '../contracts/api';
import { ServiceError } from './errors';
import { requireAgent } from './agents';
import { looseSpec } from './spec';

export async function chat(name: string, messages: ChatMessage[]): Promise<ChatResponse> {
  const agent = await requireAgent(name);
  if (agent.current_version === null) throw new ServiceError('not_found', `${name} has no live version yet; deploy it first`);
  const v = await repo.getVersion(name, agent.current_version);
  if (!v) throw new ServiceError('not_found', `live version ${agent.current_version} of ${name} is missing`);
  if (messages[messages.length - 1]?.role !== 'user') throw new ServiceError('bad_request', 'last message must be from the user');
  let spec;
  try {
    spec = validateSpec(v.spec_yaml, v.scenarios).spec ?? looseSpec(v.spec_yaml);
  } catch {
    spec = looseSpec(v.spec_yaml);
  }
  const r = await runAgent({ spec, version: v.version, messages, db: liveDb(), mode: 'live' });
  return { run_id: r.run_id, reply: r.final_reply, cost_usd: r.cost_usd };
}
