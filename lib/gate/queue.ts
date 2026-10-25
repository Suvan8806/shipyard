// Fan-out gate (escapes the 300 s serverless cap). The deploy inserts one queued scenario_results row per attempt,
// then "pumps": claims up to SHIPYARD_GATE_CONCURRENCY attempts and dispatches each to its own invocation of
// POST /api/internal/gate/run-scenario. Each worker runs one attempt (twin -> runAgent -> assert -> reply check ->
// save), pumps the next queued attempt, then tries to finalize. Reads of the version sweep stale work and re-pump.
import { createHash, timingSafeEqual } from 'node:crypto';
import * as repo from '../platform/repo';
import { compile, looseSpec } from '../services/spec';
import type { AgentSpec, Scenario } from '../types';
import { runAttempt } from './attempt';
import { gateConcurrency, mergeScenarios, planJobs } from './gate';
import { finalizeVersion, type AppliedVerdict } from './verdict';

export const RUN_SCENARIO_PATH = '/api/internal/gate/run-scenario';
export const INTERNAL_HEADER = 'x-shipyard-internal';
/** An in-flight attempt older than this is presumed dead (worker crashed or hit the cap). */
export const ATTEMPT_STALE_SECS = 6 * 60;
/** A version running longer than this is force-finished: unfinished attempts become errors. */
export const VERSION_STALE_SECS = 10 * 60;
/** Inline fallback (dispatch failed) only starts an attempt if this much of the invocation budget remains. */
const INLINE_MIN_REMAINING_MS = 90_000;
const INVOCATION_BUDGET_MS = 280_000;
const DISPATCH_TIMEOUT_MS = 15_000;

export interface DispatchCtx {
  /** Origin the internal route is reachable at (null: dispatch disabled, attempts run inline). */
  baseUrl: string | null;
  /** Vercel deployment-protection bypass secret for protected previews. */
  bypass: string | null;
  /** Epoch ms after which this invocation stops starting inline work. */
  deadline: number;
}

/** Shared secret for internal calls: SHIPYARD_INTERNAL_SECRET, else derived from SUPABASE_DB_URL (no new env needed). */
export function internalSecret(): string {
  const s = process.env.SHIPYARD_INTERNAL_SECRET;
  if (s) return s;
  return createHash('sha256').update(`shipyard-internal:${process.env.SUPABASE_DB_URL ?? ''}`).digest('hex');
}

export function isInternalRequest(req: Request): boolean {
  const got = Buffer.from(req.headers.get(INTERNAL_HEADER) ?? '');
  const want = Buffer.from(internalSecret());
  return got.length === want.length && timingSafeEqual(got, want);
}

function envBaseUrl(): string | null {
  if (process.env.SHIPYARD_GATE_BASE_URL) return process.env.SHIPYARD_GATE_BASE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  const u = process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;
  return u ? `https://${u}` : null;
}

/** Where and how to dispatch from this invocation. The request origin wins (it's the URL the caller could reach). */
export function dispatchCtx(req?: Request): DispatchCtx {
  let origin: string | null = null;
  if (req) {
    try {
      origin = new URL(req.url).origin;
    } catch {
      origin = null;
    }
  }
  return {
    baseUrl: process.env.SHIPYARD_GATE_BASE_URL ? envBaseUrl() : (origin ?? envBaseUrl()),
    bypass: process.env.VERCEL_AUTOMATION_BYPASS_SECRET || req?.headers.get('x-vercel-protection-bypass') || null,
    deadline: Date.now() + INVOCATION_BUDGET_MS,
  };
}

/** Inserts the queued rows for a deploy. Returns how many attempts were queued. */
export async function enqueueGate(args: { agent: string; version: number; spec: AgentSpec; scenarios: Scenario[] }): Promise<number> {
  const merged = mergeScenarios(args.spec, args.scenarios);
  const { jobs } = await planJobs(args.spec, merged);
  await repo.insertQueuedScenarioResults(
    args.agent,
    args.version,
    jobs.map(({ s, attempt }) => ({ scenario: s, attempt })),
  );
  return jobs.length;
}

async function dispatch(agent: string, version: number, job: repo.QueuedAttempt, ctx: DispatchCtx): Promise<boolean> {
  if (!ctx.baseUrl) return false;
  try {
    const res = await fetch(`${ctx.baseUrl}${RUN_SCENARIO_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [INTERNAL_HEADER]: internalSecret(),
        ...(ctx.bypass ? { 'x-vercel-protection-bypass': ctx.bypass } : {}),
      },
      body: JSON.stringify({ agent, version, scenario: job.scenario, attempt: job.attempt }),
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    });
    if (res.status === 202) return true;
    console.error(`[gate] dispatch ${job.scenario}#${job.attempt} got HTTP ${res.status}`);
    return false;
  } catch (e) {
    console.error(`[gate] dispatch ${job.scenario}#${job.attempt} failed:`, e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Fills free concurrency slots: claims queued attempts (bounded by SHIPYARD_GATE_CONCURRENCY across all
 * invocations) and dispatches each. If a dispatch fails, the attempt runs inline here while time allows,
 * otherwise it goes back to the queue for the next pump (a worker finishing, or a GET of the version).
 */
export async function pump(agent: string, version: number, ctx: DispatchCtx): Promise<void> {
  let claimed: repo.QueuedAttempt[];
  try {
    claimed = await repo.claimQueuedScenarios(agent, version, gateConcurrency());
  } catch (e) {
    console.error('[gate] claim failed', e);
    return;
  }
  await Promise.all(
    claimed.map(async (job) => {
      if (await dispatch(agent, version, job, ctx)) return;
      if (ctx.deadline - Date.now() > INLINE_MIN_REMAINING_MS) {
        await runClaimed(agent, version, job.scenario, job.attempt, ctx);
      } else {
        await repo.unclaimScenario(agent, version, job.scenario, job.attempt).catch(() => undefined);
      }
    }),
  );
}

function specOf(v: repo.VersionRow): AgentSpec {
  try {
    return compile(v.spec_yaml, v.scenarios).spec;
  } catch {
    return looseSpec(v.spec_yaml);
  }
}

function expectedNamesOf(v: repo.VersionRow): string[] {
  try {
    return compile(v.spec_yaml, v.scenarios).scenarios.map((s) => s.name);
  } catch {
    return [];
  }
}

async function finalizeFor(v: repo.VersionRow): Promise<AppliedVerdict | null> {
  return finalizeVersion({
    agent: v.agent,
    version: v.version,
    minPassRate: specOf(v).gate?.min_pass_rate ?? 1,
    expectedNames: expectedNamesOf(v),
    auditDetail: { spec_hash: v.spec_hash, mode: 'fanout' },
  });
}

/** Worker body: run one claimed attempt, keep the pipeline full, then finalize if everything is terminal. */
export async function runClaimed(agent: string, version: number, scenario: string, attempt: number, ctx: DispatchCtx): Promise<void> {
  const payload = await repo.getStartedScenario(agent, version, scenario, attempt);
  if (!payload) return; // already finished, swept, or never claimed
  const v = await repo.getVersion(agent, version);
  if (!v || v.status !== 'running') return;
  const spec = specOf(v);
  await runAttempt({ agent, version, spec, opts: {} }, payload as unknown as Scenario, attempt, { markRunning: false });
  await pump(agent, version, ctx);
  await finalizeFor(v).catch((e) => console.error('[gate] finalize failed', e));
}

/**
 * Cheap reconcile on read: sweep stale attempts, finalize when everything is terminal, and report whether the
 * queue needs a pump (queued work but free slots, e.g. a worker died or a dispatch was lost).
 */
export async function reconcileVersion(agent: string, version: number): Promise<{ finalized: boolean; needsPump: boolean }> {
  const v = await repo.getVersion(agent, version);
  if (!v || v.status !== 'running') return { finalized: false, needsPump: false };
  await repo.sweepStaleScenarioResults(agent, version, ATTEMPT_STALE_SECS, VERSION_STALE_SECS);
  const counts = await repo.scenarioQueueCounts(agent, version);
  if (counts.queued === 0 && counts.inflight === 0) {
    if (counts.total === 0) {
      // Nothing was ever queued (enqueue crashed). Give the deploy a grace period, then fail it.
      const ageSecs = (Date.now() - Date.parse(v.started_at)) / 1000;
      if (ageSecs > VERSION_STALE_SECS) {
        const done = await repo.finishVersionIfRunning(agent, version, { status: 'error', pass_rate: null, total_cost_usd: null });
        if (done) await repo.audit('gate', 'error', `${agent}@v${version}`, { error: 'gate never started (no scenario rows)' }).catch(() => undefined);
        return { finalized: done, needsPump: false };
      }
      return { finalized: false, needsPump: false };
    }
    const r = await finalizeFor(v);
    return { finalized: Boolean(r?.applied), needsPump: false };
  }
  return { finalized: false, needsPump: counts.queued > 0 && counts.inflight < gateConcurrency() };
}
