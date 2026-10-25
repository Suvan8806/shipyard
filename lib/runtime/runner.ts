// The agent loop (PRD 11.2). One run per conversation; one generateText per pending user turn.
// Every model step, tool call, policy block, approval and error is logged as a run event.
// runAgent never throws: failures end the run with outcome 'error'.
import { generateText, stepCountIs, tool, type LanguageModel, type ModelMessage, type ToolSet } from 'ai';
import type { z } from 'zod';
import type { RunAgentFn, RunInput, RunResult, EventType } from '../types';
import { PROFILES } from '../library/profiles';
import { getTool, toWireName } from '../library';
import { createResilientModel, resilientFor, type ChainModel, type ResilientState } from './model';
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
/** Wall-clock budget for one run; rate-limit backoff stops waiting past it (serverless cap is 300s). */
const RUN_BUDGET_MS = 240_000;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

export interface RunnerOptions {
  /** Explicit model chain (tests inject mocks here to exercise the 429 -> fallback path). */
  chain?: ChainModel[];
  /** Overrides the backoff sleep (tests). */
  sleep?: (ms: number) => Promise<void>;
}

/** Splits chat history into turns: each user message not yet followed by an assistant reply needs generation. */
function plan(messages: RunInput['messages']): { content: string; role: 'user' | 'assistant'; generate: boolean }[] {
  return messages.map((m, i) => ({
    ...m,
    generate: m.role === 'user' && messages[i + 1]?.role !== 'assistant',
  }));
}

export function createRunner(repo: RunnerRepo, opts: RunnerOptions = {}): RunAgentFn {
  return async (input: RunInput): Promise<RunResult> => {
    const { spec, db } = input;
    const profile = PROFILES[spec.profile] ?? PROFILES.careful;
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

    const tools: ToolSet = {};
    for (const name of spec.tools) {
      const def = getTool(name);
      if (!def) continue;
      tools[toWireName(name)] = tool({
        description: def.description,
        inputSchema: def.params as unknown as z.ZodType<Record<string, unknown>>,
        execute: async (args: Record<string, unknown>) => {
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
    const resilience = {
      deadline: Date.now() + RUN_BUDGET_MS,
      sleep: opts.sleep,
      onThrottle: (t: { model: string; waitMs: number | null; fallbackTo: string | null; error: string }) => {
        void log({
          type: 'error',
          name: 'rate_limit',
          payload: { model: t.model, retry_in_ms: t.waitMs, fallback_to: t.fallbackTo, error: t.error },
        });
      },
    };
    let model: LanguageModel;
    let state: ResilientState;
    if (opts.chain) {
      ({ model, state } = createResilientModel(opts.chain, resilience));
    } else if (input.modelOverride) {
      model = input.modelOverride;
      state = { current: 'mock', fallbackFrom: null, waitedMs: 0 };
    } else {
      ({ model, state } = resilientFor(profile.model, resilience));
    }
    const history: ModelMessage[] = [];

    try {
      for (const turn of plan(input.messages)) {
        history.push({ role: turn.role, content: turn.content });
        if (!turn.generate) continue;

        let last = Date.now();
        const result = await generateText({
          model,
          instructions,
          messages: history,
          tools,
          stopWhen: stepCountIs(MAX_STEPS),
          temperature: profile.temperature,
          maxOutputTokens: profile.maxOutputTokens,
          // Throttles (429/503) are handled per call inside the resilient model (backoff + fallback chain);
          // this only retries other transient failures.
          maxRetries: 2,
          onStepEnd: (step) => {
            const now = Date.now();
            const tin = step.usage.inputTokens ?? 0;
            const tout = step.usage.outputTokens ?? 0;
            const used = state.current;
            const cost = costOf(used, step.usage);
            totals.cost += cost;
            totals.tin += tin;
            totals.tout += tout;
            void log({
              type: 'model_call',
              name: used,
              payload: {
                step: step.stepNumber,
                finish_reason: step.finishReason,
                tool_calls: step.toolCalls.map((c) => c.toolName),
                text: step.text ? step.text.slice(0, 2000) : null,
                ...(state.fallbackFrom ? { fallback_from: state.fallbackFrom } : {}),
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
