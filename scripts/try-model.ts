// A1: prove a real tool-calling loop on the careful profile model (Groq by default).
// Run: npx tsx scripts/try-model.ts
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import { resolveModel } from '../lib/runtime/model';

try {
  process.loadEnvFile('.env.local');
} catch {
  /* env may already be set */
}

const MODEL = process.env.SHIPYARD_CAREFUL_MODEL ?? 'groq/openai/gpt-oss-120b';

async function main() {
  let last = Date.now();
  const result = await generateText({
    model: resolveModel(MODEL),
    instructions: 'You are a credit union support agent. Use tools to look up accounts before answering.',
    prompt: "What's the balance on A-100?",
    tools: {
      accounts_get: tool({
        description: 'Look up a member account by id.',
        inputSchema: z.object({ account_id: z.string() }),
        execute: async ({ account_id }) => ({ id: account_id, owner: 'Dana Lee', balance: 412.0 }),
      }),
    },
    stopWhen: stepCountIs(8),
    maxOutputTokens: 1200,
    onStepEnd: (step) => {
      const now = Date.now();
      console.log(
        `step ${step.stepNumber} finish=${step.finishReason} tools=${JSON.stringify(
          step.toolCalls.map((c) => ({ name: c.toolName, input: c.input })),
        )} usage(in=${step.usage.inputTokens}, out=${step.usage.outputTokens}) latency=${now - last}ms`,
      );
      last = now;
    },
  });
  console.log('model:', MODEL);
  console.log('final:', result.text);
  console.log('totalUsage:', JSON.stringify(result.totalUsage));
}

main().catch((e) => {
  console.error('FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
