// Deploy: validate -> rate limit -> create version 'running' -> gate (run in after()) ; gate results; rollback.
import * as repo from '../platform/repo';
import { runGate } from '../gate/gate';
import { expandTestPacks } from '../gate/packs';
import type { GateResult } from '../types';
import type { DeployResponse, RollbackResponse } from '../contracts/api';
import { ServiceError, notFound } from './errors';
import { requireAgent } from './agents';
import { compile, looseScenarios, looseSpec } from './spec';

const HOUR_MS = 60 * 60 * 1000;

function maxDeploysPerHour(): number {
  const n = Number(process.env.SHIPYARD_MAX_DEPLOYS_PER_HOUR ?? 20);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export interface StartedDeploy extends DeployResponse {
  /** Runs the gate to completion. Pass to after(); never throws (errors mark the version 'error'). */
  run: () => Promise<GateResult | null>;
}

export async function startDeploy(name: string, actor = 'api'): Promise<StartedDeploy> {
  const agent = await requireAgent(name);
  const { spec, scenarios, specHash } = compile(agent.draft_spec_yaml, agent.draft_scenarios);

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

  const run = async (): Promise<GateResult | null> => {
    try {
      return await runGate({ agent: name, version, spec, scenarios, specHash });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[deploy] gate failed for ${name} v${version}:`, message);
      try {
        const v = await repo.getVersion(name, version);
        if (v?.status === 'running') {
          await repo.finishVersion(name, version, { status: 'error', pass_rate: null, total_cost_usd: null });
        }
        await repo.audit('gate', 'deploy.error', name, { version, message });
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
    coverage: null,
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
