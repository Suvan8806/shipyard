// System prompt assembly (PRD 11.1): inherited blocks in order, then the goal, then the instructions.
// Tools are passed as AI SDK tool definitions, never as prompt text.
import type { AgentSpec } from '../types';
import { blockText } from '../library';

export function buildSystemPrompt(spec: AgentSpec): string {
  const parts: string[] = [];
  for (const name of spec.inherit) {
    const text = blockText(name);
    if (text) parts.push(text.trim());
  }
  parts.push(`Goal: ${spec.goal.trim()}`);
  if (spec.instructions.trim()) parts.push(spec.instructions.trim());
  parts.push(
    'Tool names use underscores where these instructions use dots (for example accounts.get is the tool accounts_get). ' +
      'If a tool returns an error or a pending approval, tell the member plainly what happened; never claim an action succeeded when it did not.',
  );
  return parts.join('\n\n');
}
