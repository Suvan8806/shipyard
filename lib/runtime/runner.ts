// The agent loop (PRD 11.2). One run per conversation; one generateText per pending user turn.
// Every model step, tool call, policy block, approval and error is logged as a run event.
// runAgent never throws: failures end the run with outcome 'error'.
import { APICallError, RetryError, generateText, stepCountIs, tool, type ModelMessage, type ToolSet } from 'ai';
import type { z } from 'zod';
import type { RunAgentFn, RunInput, RunResult, EventType } from '../types';
import { PROFILES } from '../library/profiles';
import { getTool, toWireName } from '../library';
import { resolveModel } from './model';
import { costOf } from './cost';
import { buildSystemPrompt } from './prompt';
import { checkPolicy, newRunState } from './policy';

export interface RunEventInput {
  type: EventType;
  name?: string | null;
  payload?: unknown;
  tokens_in?: number | null;
  tokens_out?: number | null;
  cost_usd?: number | null;
  latency_ms?: number | null;
}

/** The repo calls the runner needs. Injected in tests (no Supabase from this laptop). */
export interface RunnerRepo {
  createRun(input: { agent: string; version: number | null; mode: RunInput['mode']; scenario?: string | null }): Promise<{ id: string }>;
  appendEvent(runId: string, event: RunEventInput): Promise<number>;
  finishRun(
    id: string,
    result: { cost_usd: number; tokens_in: number; tokens_out: number; outcome: string; final_reply: string | null },
  ): Promise<void>;
}

const MAX_STEPS = 8;
const MAX_TURN_RETRIES = 2;
const MAX_WAIT_MS = 30_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

/** If `e` is a rate limit (429), the ms to wait (retry-after honored); otherwise null. */
export function rateLimitDelay(e: unknown, attempt: number): number | null {
  const inner = RetryError.isInstance(e) ? e.lastError : e;
  if (!APICallError.isInstance(inner) || inner.statusCode !== 429) return null;
  const h = inner.responseHeaders ?? {};
  const ms = Number(h['retry-after-ms']);
  if (Number.isFinite(ms) && ms > 0) return Math.min(ms, MAX_WAIT_MS);
  const s = Number(h['retry-after']);
  if (Number.isFinite(s) && s > 0) return Math.min(s * 1000, MAX_WAIT_MS);
  return Math.min(2000 * 2 ** attempt, MAX_WAIT_MS);
}

/** Splits chat history into turns: each user message not yet followed by an assistant reply needs generation. */
function plan(messages: RunInput['messages']): { content: string; role: 'user' | 'assistant'; generate: boolean }[] {
  return messages.map((m, i) => ({
    ...m,
    generate: m.role === 'user' && messages[i + 1]?.role !== 'assistant',
  }));
}

export function createRunner(repo: RunnerRepo): RunAgentFn {
  return async (input: RunInput): Promise<RunResult> => {
    const { spec, db } = input;
    const profile = PROFILES[spec.profile] ?? PROFILES.careful;
    const modelId = input.modelOverride ? 'mock' : profile.model;
    const totals = { cost: 0, tin: 0, tout: 0, events: 0 };
    let outcome: 'ok' | 'error' = 'ok';
    let finalReply = '';

    let runId: string;
    try {
      runId = (await repo.createRun({ agent: spec.name, version: input.version, mode: input.mode, scenario: input.scenario ?? null })).id;
    } catch (e) {
      console.error('[runner] createRun failed:', errMsg(e));
      return { run_id: '', final_reply: '', cost_usd: 0, tokens_in: 0, tokens_out: 0, outcome: 'error', events_count: 0 };
    }

    // Serialize event appends (repo assigns seq = max+1, so parallel appends would race).
    let chain: Promise<unknown> = Promise.resolve();
    const log = (event: RunEventInput) => {
      totals.events++;
      chain = chain.then(() => repo.appendEvent(runId, event)).catch((e) => console.error('[runner] appendEvent failed:', errMsg(e)));
      return chain;
    };

    // Tool events are buffered and flushed right after their step's model_call, so traces read
    // "model decided -> tool ran" in seq order.
    let pending: RunEventInput[] = [];
    const logTool = (event: RunEventInput) => {
      pending.push(event);
    };
    const flushTools = () => {
      const p = pending;
      pending = [];
      for (const ev of p) void log(ev);
    };

    const runState = newRunState();
    let toolsRanThisTurn = 0;

    const tools: ToolSet = {};
    for (const name of spec.tools) {
      const def = getTool(name);
      if (!def) continue;
      tools[toWireName(name)] = tool({
        description: def.description,
        inputSchema: def.params as unknown as z.ZodType<Record<string, unknown>>,
        execute: async (args: Record<string, unknown>) => {
          toolsRanThisTurn++;
          try {
            const decision = await checkPolicy({ tool: name, args, spec, runState, db, runId });
            if (decision.kind === 'block') {
              logTool({ type: 'policy_block', name, payload: { args, reason: decision.reason } });
              return { error: decision.reason };
            }
            if (decision.kind === 'approval') {
              const result = {
                status: 'pending_approval',
                approval_id: decision.approvalId,
                message: `${name} was not executed. It is waiting for a human to approve it.`,
              };
              logTool({ type: 'approval', name, payload: { args, approval_id: decision.approvalId } });
              return result;
            }
            const result = await def.handler({ db, agent: spec.name, runId }, args);
            logTool({ type: 'tool_call', name, payload: { args, result } });
            return result;
          } catch (e) {
            logTool({ type: 'error', name, payload: { args, error: errMsg(e) } });
            return { error: `tool ${name} failed: ${errMsg(e)}` };
          }
        },
      });
    }

    const instructions = buildSystemPrompt(spec);
    const model = input.modelOverride ?? resolveModel(profile.model);
    const history: ModelMessage[] = [];

    try {
      for (const turn of plan(input.messages)) {
        history.push({ role: turn.role, content: turn.content });
        if (!turn.generate) continue;

        for (let attempt = 0; ; attempt++) {
          toolsRanThisTurn = 0;
          let last = Date.now();
          try {
            const result = await generateText({
              model,
              instructions,
              messages: history,
              tools,
              stopWhen: stepCountIs(MAX_STEPS),
              temperature: profile.temperature,
              maxOutputTokens: profile.maxOutputTokens,
              maxRetries: 4, // per model call; the SDK honors retry-after on 429
              onStepEnd: (step) => {
                const now = Date.now();
                const tin = step.usage.inputTokens ?? 0;
                const tout = step.usage.outputTokens ?? 0;
                const cost = costOf(modelId, step.usage);
                totals.cost += cost;
                totals.tin += tin;
                totals.tout += tout;
                void log({
                  type: 'model_call',
                  name: modelId,
                  payload: {
                    step: step.stepNumber,
                    finish_reason: step.finishReason,
                    tool_calls: step.toolCalls.map((c) => c.toolName),
                    text: step.text ? step.text.slice(0, 2000) : null,
                  },
                  tokens_in: tin,
                  tokens_out: tout,
                  cost_usd: cost,
                  latency_ms: now - last,
                });
                last = now;
                flushTools();
              },
            });
            history.push(...result.responseMessages);
            finalReply = result.text;
            break;
          } catch (e) {
            const wait = rateLimitDelay(e, attempt);
            // Only retry a whole turn when no tool ran in it (tools have side effects).
            if (wait !== null && toolsRanThisTurn === 0 && attempt < MAX_TURN_RETRIES) {
              void log({ type: 'error', name: 'rate_limit', payload: { error: errMsg(e), retry_in_ms: wait } });
              await sleep(wait);
              continue;
            }
            throw e;
          }
        }
      }
    } catch (e) {
      outcome = 'error';
      void log({ type: 'error', name: 'run', payload: { error: errMsg(e) } });
    }

    flushTools();
    await chain;
    const cost_usd = Math.round(totals.cost * 1e8) / 1e8;
    try {
      await repo.finishRun(runId, { cost_usd, tokens_in: totals.tin, tokens_out: totals.tout, outcome, final_reply: finalReply || null });
    } catch (e) {
      console.error('[runner] finishRun failed:', errMsg(e));
    }
    return {
      run_id: runId,
      final_reply: finalReply,
      cost_usd,
      tokens_in: totals.tin,
      tokens_out: totals.tout,
      outcome,
      events_count: totals.events,
    };
  };
}

async function defaultRepo(): Promise<RunnerRepo> {
  const repo = await import('../platform/repo');
  return { createRun: repo.createRun, appendEvent: repo.appendEvent, finishRun: repo.finishRun };
}

/** The production runner (writes runs + run_events to Supabase via lib/platform/repo). */
export const runAgent: RunAgentFn = async (input) => createRunner(await defaultRepo())(input);
