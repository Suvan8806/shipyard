// Deploy: validate -> rate limit -> create version 'running' -> gate ; gate results; rollback.
// The gate fans out (lib/gate/queue.ts): one serverless invocation per scenario attempt, so a big suite is never
// cut off by the 300 s function cap. SHIPYARD_GATE_MODE=inline runs the whole gate in one invocation instead.
import * as repo from '../platform/repo';
import { mergeScenarios, runGate, tryReplay } from '../gate/gate';
import { dispatchCtx, enqueueGate, pump, reconcileVersion, type DispatchCtx } from '../gate/queue';
import { finalizeVersion } from '../gate/verdict';
import { withReplay } from '../gate/replay';
import { expandTestPacks } from '../gate/packs';
import { computeCoverage, scenariosForNames } from '../gate/coverage';
import type { AgentSpec, GateCoverage, GateResult, ScenarioResultSummary } from '../types';
import type { DeployResponse, RollbackResponse } from '../contracts/api';
import { ServiceError, notFound } from './errors';
import { requireBudget } from './budget';
import { requireAgent } from './agents';
import { compile, looseScenarios, looseSpec } from './spec';

const HOUR_MS = 60 * 60 * 1000;

function maxDeploysPerHour(): number {
  const n = Number(process.env.SHIPYARD_MAX_DEPLOYS_PER_HOUR ?? 20);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export interface RunGateOptions {
  /** Dispatch context (request origin + protection bypass). Defaults to one derived from Vercel env. */
  ctx?: DispatchCtx;
  /** Wait (polling + supervising the queue) until the gate is terminal or ~280 s pass. Default true. */
  wait?: boolean;
  /**
   * Force the demo replay cache on for this deploy (?replay=1), as if SHIPYARD_DEMO_REPLAY=1: if a finished
   * version of this agent has the same spec hash, its results are replayed with staggered timing (no LLM calls).
   * Otherwise the gate runs normally.
   */
  replay?: boolean;
}

export interface StartedDeploy extends DeployResponse {
  /**
   * Starts the gate. Pass to after(); never throws (errors mark the version 'error'). With wait (default) it
   * resolves with the final result (or the latest one after ~280 s); with wait:false it resolves once dispatched.
   */
  run: (opts?: RunGateOptions) => Promise<GateResult | null>;
}

function gateMode(): 'inline' | 'fanout' {
  return process.env.SHIPYARD_GATE_MODE === 'inline' ? 'inline' : 'fanout';
}

/** Reconcile on read (stale sweep, finalize, lost-dispatch detection). Never throws. */
export async function reconcileGate(name: string, version: number): Promise<{ needsPump: boolean }> {
  if (!Number.isInteger(version) || version < 1) return { needsPump: false };
  try {
    const r = await reconcileVersion(name, version);
    return { needsPump: r.needsPump };
  } catch (e) {
    console.error('[deploy] reconcile failed', e);
    return { needsPump: false };
  }
}

/** Polls the version, re-pumping the queue when slots free up, until it is terminal or the timeout passes. */
async function superviseGate(name: string, version: number, ctx: DispatchCtx, timeoutMs = 280_000, intervalMs = 3_000): Promise<GateResult> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { needsPump } = await reconcileGate(name, version);
    if (needsPump) await pump(name, version, ctx);
    const v = await repo.getVersion(name, version);
    if (!v || v.status !== 'running' || Date.now() + intervalMs > deadline) return getGateResult(name, version);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export async function startDeploy(name: string, actor = 'api'): Promise<StartedDeploy> {
  const agent = await requireAgent(name);
  const { spec, scenarios, specHash } = compile(agent.draft_spec_yaml, agent.draft_scenarios);

  await requireBudget();
  const recent = await repo.countDeploysSince(new Date(Date.now() - HOUR_MS));
  const max = maxDeploysPerHour();
  if (recent >= max) {
    throw new ServiceError('rate_limited', `deploy limit reached (${max}/hour across all agents); try again later`);
  }

  const version = await repo.nextVersion(name);
  await repo.createVersion({
    agent: name,
    version,
    spec_yaml: agent.draft_spec_yaml,
    scenarios: agent.draft_scenarios,
    spec_hash: specHash,
    status: 'running',
  });
  await repo.audit(actor, 'deploy.start', name, { version, scenarios: scenarios.length });

  const run = async (opts: RunGateOptions = {}): Promise<GateResult | null> => {
    try {
      const forceReplay = opts.replay === true;
      if (gateMode() === 'inline') return await withReplay(forceReplay, () => runGate({ agent: name, version, spec, scenarios, specHash }));
      const ctx = opts.ctx ?? dispatchCtx();
      const startedAt = new Date().toISOString();
      const replay = await withReplay(forceReplay, () =>
        tryReplay({ agent: name, version, spec, specHash, startedAt }, mergeScenarios(spec, scenarios)),
      );
      if (replay) return replay;
      const queued = await enqueueGate({ agent: name, version, spec, scenarios });
      if (queued === 0) {
        await finalizeVersion({ agent: name, version, minPassRate: spec.gate?.min_pass_rate ?? 1, auditDetail: { spec_hash: specHash } });
      } else {
        await pump(name, version, ctx);
      }
      if (opts.wait === false) return null;
      // Workers own the outcome from here; a supervision hiccup must not fail the version.
      return await superviseGate(name, version, ctx).catch((e) => {
        console.error(`[deploy] supervising ${name} v${version} failed:`, e);
        return null;
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[deploy] gate failed for ${name} v${version}:`, message);
      try {
        const done = await repo.finishVersionIfRunning(name, version, { status: 'error', pass_rate: null, total_cost_usd: null });
        if (done) await repo.audit('gate', 'deploy.error', name, { version, message });
      } catch (inner) {
        console.error('[deploy] could not record gate error:', inner);
      }
      return null;
    }
  };
  return { version, status: 'running', run };
}

function scenarioNamesFor(specYaml: string, scenarios: Record<string, string>): string[] {
  try {
    const spec = looseSpec(specYaml);
    const own = looseScenarios(scenarios);
    const ownNames = new Set(own.map((s) => s.name));
    return [...own.map((s) => s.name), ...expandTestPacks(spec).map((s) => s.name).filter((n) => !ownNames.has(n))];
  } catch {
    return Object.keys(scenarios).map((f) => f.replace(/\.ya?ml$/, ''));
  }
}

function specAndScenarios(v: repo.VersionRow): { spec: AgentSpec; known: ReturnType<typeof mergeScenarios> } {
  let spec: AgentSpec;
  let own: ReturnType<typeof looseScenarios>;
  try {
    ({ spec, scenarios: own } = compile(v.spec_yaml, v.scenarios));
  } catch {
    spec = looseSpec(v.spec_yaml);
    own = looseScenarios(v.scenarios);
  }
  return { spec, known: mergeScenarios(spec, own) };
}

/**
 * Coverage computed on read from scenario_results + their runs' tool events (no coverage column, so fan-out
 * gates and inline gates report it the same way). Null if it can't be computed.
 */
async function coverageOnRead(v: repo.VersionRow, names: string[], results: ScenarioResultSummary[]): Promise<GateCoverage | null> {
  try {
    const { spec, known } = specAndScenarios(v);
    const scenarios = scenariosForNames(known, names, (n) => ({
      name: n,
      description: '',
      setup: {},
      conversation: [],
      assert: [],
      ...repo.inferScenarioSource(n),
    }));
    const events = await repo.listToolEventsForRuns(results.map((r) => r.run_id).filter((x): x is string => Boolean(x)));
    return computeCoverage(spec, scenarios, events);
  } catch (e) {
    console.error('[deploy] coverage failed', e);
    return null;
  }
}

export async function getGateResult(name: string, version: number): Promise<GateResult> {
  if (!Number.isInteger(version) || version < 1) throw new ServiceError('bad_request', 'version must be a positive integer');
  const agent = await requireAgent(name);
  const v = await repo.getVersion(name, version);
  if (!v) throw notFound(`version ${version} of ${name}`);
  const results = await repo.listScenarioResults(name, version);
  const names = scenarioNamesFor(v.spec_yaml, v.scenarios);
  for (const r of results) if (!names.includes(r.scenario)) names.push(r.scenario);
  return {
    agent: name,
    version,
    status: v.status,
    pass_rate: v.pass_rate,
    total_cost_usd: v.total_cost_usd,
    started_at: v.started_at,
    finished_at: v.finished_at,
    current_version: agent.current_version,
    scenario_names: names,
    results,
    coverage: await coverageOnRead(v, names, results),
  };
}

/** Polls until the version leaves 'running' or the timeout passes; returns the latest gate result either way. */
export async function waitForGate(name: string, version: number, timeoutMs = 280_000, intervalMs = 2_000): Promise<GateResult> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await repo.getVersion(name, version);
    if (!v) throw notFound(`version ${version} of ${name}`);
    if (v.status !== 'running' || Date.now() + intervalMs > deadline) return getGateResult(name, version);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** Point current_version at the previous 'live' version below the current one. */
export async function rollback(name: string, actor = 'api'): Promise<RollbackResponse> {
  const agent = await requireAgent(name);
  const versions = await repo.listVersions(name); // desc
  const current = agent.current_version;
  const target = versions.find((v) => v.status === 'live' && (current === null || v.version < current));
  if (!target) throw new ServiceError('conflict', `no earlier live version of ${name} to roll back to`);
  await repo.setCurrentVersion(name, target.version);
  await repo.audit(actor, 'rollback', name, { from: current, to: target.version });
  return { current_version: target.version };
}
