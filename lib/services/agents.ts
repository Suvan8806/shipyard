// Agents: list, detail, create/replace draft, save spec, validate.
import * as repo from '../platform/repo';
import type {
  AgentDetail,
  AgentSummary,
  CreateAgentBody,
  CreateAgentResponse,
  ValidateResponse,
} from '../contracts/api';
import { ServiceError, notFound } from './errors';
import { specName, validate } from './spec';
import { specTeam } from '../enterprise/roles';
import { setAgentTeam } from '../platform/enterprise-repo';
import { validateSpecTeam } from './teams';

export const NAME_RE = /^[a-z0-9-]{2,40}$/;

export function assertName(name: string): void {
  if (!NAME_RE.test(name)) throw new ServiceError('bad_request', 'agent name must match ^[a-z0-9-]{2,40}$');
}

export async function listAgents(): Promise<AgentSummary[]> {
  return repo.listAgentSummaries();
}

export async function requireAgent(name: string): Promise<repo.AgentRow> {
  assertName(name);
  const agent = await repo.getAgent(name);
  if (!agent) throw notFound(`agent ${name}`);
  return agent;
}

export async function getAgentDetail(name: string): Promise<AgentDetail> {
  const agent = await requireAgent(name);
  const versions = await repo.listVersions(name);
  return {
    name: agent.name,
    team: agent.team,
    owner: agent.owner,
    current_version: agent.current_version,
    draft_spec_yaml: agent.draft_spec_yaml,
    draft_scenarios: agent.draft_scenarios,
    validation: validate(agent.draft_spec_yaml, agent.draft_scenarios),
    versions,
  };
}

/** Create or replace an agent's draft (spec + scenarios). Saves even if invalid; returns the validation errors. */
export async function createAgent(body: CreateAgentBody, actor = 'api'): Promise<CreateAgentResponse> {
  const name = specName(body.spec_yaml);
  if (!name) {
    throw new ServiceError('bad_request', 'spec_yaml needs a top-level `name:` matching ^[a-z0-9-]{2,40}$');
  }
  const v = validate(body.spec_yaml, body.scenarios);
  await repo.upsertAgentDraft({
    name,
    draft_spec_yaml: body.spec_yaml,
    draft_scenarios: body.scenarios,
    team: body.team ?? null,
    owner: body.owner ?? null,
  });
  await repo.audit(actor, 'agent.create', name, { ok: v.ok, errors: v.errors.length, scenarios: Object.keys(body.scenarios) });
  return { name, ok: v.ok, errors: v.errors };
}

/** Save the draft spec (even if invalid) and return validation against the draft scenarios. */
export async function saveSpec(name: string, specYaml: string, actor = 'api'): Promise<ValidateResponse> {
  const agent = await requireAgent(name);
  const declared = specName(specYaml);
  if (declared && declared !== name) {
    throw new ServiceError('bad_request', `spec name "${declared}" does not match agent "${name}"`);
  }
  const team = await validateSpecTeam(specTeam(specYaml));
  await repo.upsertAgentDraft({ name, draft_spec_yaml: specYaml });
  if (team) await setAgentTeam(name, team);
  const v = validate(specYaml, agent.draft_scenarios);
  await repo.audit(actor, 'agent.save_spec', name, { ok: v.ok, errors: v.errors.length });
  return v;
}

/** Add scenarios to the draft (e.g. accepted generated tests). */
export async function addScenarios(name: string, scenarios: Record<string, string>, actor = 'api'): Promise<ValidateResponse> {
  const agent = await requireAgent(name);
  const merged = { ...agent.draft_scenarios, ...scenarios };
  await repo.upsertAgentDraft({ name, draft_spec_yaml: agent.draft_spec_yaml, draft_scenarios: merged });
  await repo.audit(actor, 'agent.add_scenarios', name, { files: Object.keys(scenarios) });
  return validate(agent.draft_spec_yaml, merged);
}

export async function validateAgent(name: string): Promise<ValidateResponse> {
  const agent = await requireAgent(name);
  return validate(agent.draft_spec_yaml, agent.draft_scenarios);
}
