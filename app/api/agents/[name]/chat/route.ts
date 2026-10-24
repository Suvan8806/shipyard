import { ChatBody, type ChatResponse } from '@/lib/contracts/api';
import { runAgent } from '@/lib/runtime/runner';
import { liveDb } from '@/lib/sysdb/live';
import type { AgentSpec } from '@/lib/types';
import { ok, parseBody, requireAdmin } from '../../../_lib/http';

export const maxDuration = 60;

type Ctx = { params: Promise<{ name: string }> };

const STUB_SPEC: AgentSpec = {
  name: 'support-agent',
  goal: 'Help credit union members with billing questions and payment problems.',
  profile: 'careful',
  inherit: ['brand-tone', 'compliance', 'escalation'],
  tools: ['accounts.get', 'accounts.apply_credit', 'payments.defer', 'crm.add_note', 'approval.request', 'email.send'],
  instructions: '',
  test_packs: [],
  gate: { min_pass_rate: 1, runs_per_scenario: 1, variants: 0 },
};

// W0 STUB: the runAgent stub returns the fixture run.
export async function POST(req: Request, ctx: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { name } = await ctx.params;
  const { data, error } = await parseBody(req, ChatBody);
  if (error) return error;
  const r = await runAgent({
    spec: { ...STUB_SPEC, name },
    version: 1,
    messages: data.messages,
    db: liveDb(),
    mode: 'live',
  });
  return ok<ChatResponse>({ run_id: r.run_id, reply: r.final_reply, cost_usd: r.cost_usd });
}
