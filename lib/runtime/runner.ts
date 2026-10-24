// W0 STUB (Lane A implements the real agent loop, PRD 11.2). Returns a fixture so C/D can work end to end.
import type { RunAgentFn } from '../types';
import { RUN_TRACE } from '../mock/fixtures';

export const runAgent: RunAgentFn = async (input) => {
  const r = RUN_TRACE.run;
  return {
    run_id: r.id,
    final_reply: r.final_reply ?? '',
    cost_usd: r.cost_usd,
    tokens_in: r.tokens_in,
    tokens_out: r.tokens_out,
    outcome: input.messages.length > 0 ? 'ok' : 'error',
    events_count: RUN_TRACE.events.length,
  };
};
