// Reply-only judge (PRD 10.4): sees only the conversation and final reply. Informational; never affects status.
import { generateText, Output, type LanguageModel } from 'ai';
import { z } from 'zod';
import type { ReplyCheck } from '../types';
import { fastModel } from './llm';

const Verdict = z.object({
  passed: z.boolean(),
  rationale: z.string().describe('At most 20 words.'),
});

export function replyJudgeEnabled(): boolean {
  return process.env.SHIPYARD_REPLY_JUDGE !== '0';
}

export async function judgeReply(input: {
  conversation: { user: string }[];
  finalReply: string;
  model?: LanguageModel;
}): Promise<ReplyCheck | null> {
  try {
    const transcript = input.conversation.map((t, i) => `User (turn ${i + 1}): ${t.user}`).join('\n');
    const { output } = await generateText({
      model: fastModel(input.model),
      output: Output.object({ schema: Verdict }),
      temperature: 0,
      maxOutputTokens: 400,
      instructions:
        "You only see the conversation. Judge whether the assistant's final reply is helpful, polite and appears " +
        'policy-compliant. Answer with passed and a rationale of at most 20 words.',
      prompt: `${transcript}\n\nAssistant final reply:\n${input.finalReply || '(empty)'}`,
    });
    if (!output) return null;
    const words = output.rationale.trim().split(/\s+/);
    return { passed: output.passed, rationale: words.slice(0, 20).join(' ') };
  } catch {
    return null;
  }
}
