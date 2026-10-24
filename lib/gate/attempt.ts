// One scenario attempt on its own throwaway twin: seed -> runAgent -> snapshot/diff -> assertions -> reply check
// -> save. Shared by the in-process gate (runGate) and the fan-out worker (/api/internal/gate/run-scenario).
import type { LanguageModel } from 'ai';
import * as repo from '../platform/repo';
import { runAgent } from '../runtime/runner';
import { createTwin } from '../twins/twin';
import { diffSnapshots } from '../twins/diff';
import type {
  AgentSpec,
  AssertionOutcome,
  ReplyCheck,
  Scenario,
  ScenarioResultSummary,
  ScenarioStatus,
  Snapshot,
  SystemDb,
  TwinDiff,
} from '../types';
import { evaluateAssertions } from './assertions';
import { judgeReply, replyJudgeEnabled } from './reply-check';

export interface GateOptions {
  /** Tests inject the AI SDK mock model; passed to runAgent (and the judge / paraphraser unless they're off). */
  modelOverride?: LanguageModel;
}

export interface AttemptResult {
  summary: ScenarioResultSummary;
  cost: number;
  criticalFailed: boolean;
}

/** Live safety: the gate only ever runs scenarios on twins. */
export function assertTwinDb(db: SystemDb): void {
  if (!db || db.kind !== 'twin') throw new Error('gate refuses to run a scenario on a non-twin (live) database');
}

/** Errors count as critical failures: an errored attempt cannot prove the critical checks held. */
export function criticalFailedOf(s: Pick<ScenarioResultSummary, 'status' | 'assertions'>): boolean {
  return s.status === 'error' || (s.assertions ?? []).some((o) => o.critical && !o.passed);
}

/** An AttemptResult rebuilt from a stored scenario_results row (fan-out finalize). */
export function attemptFromSummary(summary: ScenarioResultSummary, cost = 0): AttemptResult {
  return { summary, cost, criticalFailed: criticalFailedOf(summary) };
}

async function safeUpsert(input: repo.ScenarioResultInput): Promise<void> {
  for (let i = 0; i < 2; i++) {
    try {
      await repo.upsertScenarioResult(input);
      return;
    } catch (err) {
      console.error('[gate] upsertScenarioResult failed', input.scenario, err);
    }
  }
}

/** The run's last error event message (so an errored test says why, e.g. the rate-limit chain was exhausted). */
async function runErrorMessage(runId: string | null): Promise<string | null> {
  if (!runId) return null;
  try {
    const events = await repo.listEvents(runId);
    const err = [...events].reverse().find((e) => e.type === 'error' && e.name === 'run');
    const msg = (err?.payload as { error?: unknown } | null)?.error;
    return typeof msg === 'string' ? msg : null;
  } catch {
    return null;
  }
}

export async function runAttempt(
  ctx: { agent: string; version: number; spec: AgentSpec; opts: GateOptions },
  scenario: Scenario,
  attempt: number,
  flags: { markRunning?: boolean } = {},
): Promise<AttemptResult> {
  const { agent, version, spec, opts } = ctx;
  const base = { agent, version, scenario: scenario.name, attempt, source: scenario.source, pack: scenario.pack ?? null };
  if (flags.markRunning !== false) await safeUpsert({ ...base, status: 'running' });

  let twin: Awaited<ReturnType<typeof createTwin>> | null = null;
  let runId: string | null = null;
  let finalReply: string | null = null;
  let before: Snapshot | null = null;
  let after: Snapshot | null = null;
  let diff: TwinDiff | null = null;
  let outcomes: AssertionOutcome[] = [];
  let replyCheck: ReplyCheck | null = null;
  let cost = 0;
  let status: ScenarioStatus = 'error';
  try {
    twin = await createTwin();
    assertTwinDb(twin.db);
    await twin.seed(scenario.setup ?? {});
    before = await twin.snapshot();
    const r = await runAgent({
      spec,
      version,
      messages: scenario.conversation.map((t) => ({ role: 'user' as const, content: t.user })),
      db: twin.db,
      mode: 'scenario',
      scenario: scenario.name,
      modelOverride: opts.modelOverride,
    });
    runId = r.run_id || null;
    finalReply = r.final_reply;
    cost = Number(r.cost_usd) || 0;
    after = await twin.snapshot();
    diff = diffSnapshots(before, after);
    outcomes = await evaluateAssertions(twin.db, scenario.assert ?? [], finalReply ?? '');
    status = r.outcome === 'error' ? 'error' : outcomes.every((o) => o.passed) ? 'passed' : 'failed';
    if (status === 'error' && !finalReply) {
      finalReply = `Gate error: ${(await runErrorMessage(runId)) ?? 'the agent run failed (see trace)'}`;
    }
    if (status !== 'error' && replyJudgeEnabled()) {
      replyCheck = await judgeReply({ conversation: scenario.conversation, finalReply: finalReply ?? '' });
    }
  } catch (err) {
    console.error('[gate] scenario attempt failed', scenario.name, attempt, err);
    status = 'error';
    finalReply = finalReply || `Gate error: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    if (twin) await twin.close().catch(() => undefined);
  }

  await safeUpsert({
    ...base,
    status,
    run_id: runId,
    assertions: outcomes,
    reply_check: replyCheck,
    final_reply: finalReply,
    diff,
    before_snapshot: before,
    after_snapshot: after,
  });
  const summary: ScenarioResultSummary = {
    scenario: scenario.name,
    attempt,
    status,
    run_id: runId,
    assertions: outcomes,
    reply_check: replyCheck,
    final_reply: finalReply,
    diff,
    source: scenario.source,
    ...(scenario.pack ? { pack: scenario.pack } : {}),
  };
  return { cost, criticalFailed: criticalFailedOf(summary), summary };
}
