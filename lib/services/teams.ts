// Teams: list with agent counts + spend this month + budget state; per-team budget enforcement (cached 10 s).
import * as ent from '../platform/enterprise-repo';
import { budgetState, teamBudgetMessage, teamError, type BudgetState, type Identity } from '../enterprise/roles';
import { ServiceError, notFound } from './errors';

export interface TeamSummary {
  id: string;
  name: string;
  agents: number;
  spend_usd: number;
  monthly_budget_usd: number | null;
  budget_state: BudgetState;
}

export const TEAM_SPEND_CACHE_MS = 10_000;
let spendCache: { at: number; value: Record<string, number> } | null = null;

export function resetTeamSpendCache(): void {
  spendCache = null;
}

export async function teamSpend(now = Date.now()): Promise<Record<string, number>> {
  if (spendCache && now - spendCache.at < TEAM_SPEND_CACHE_MS) return spendCache.value;
  const value = await ent.teamSpendThisMonth();
  spendCache = { at: now, value };
  return value;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

export async function listTeams(): Promise<TeamSummary[]> {
  const [teams, counts, spend] = await Promise.all([ent.listTeams(), ent.agentCountsByTeam(), teamSpend()]);
  return teams.map((t) => {
    const s = round(spend[t.id] ?? 0);
    return { id: t.id, name: t.name, agents: counts[t.id] ?? 0, spend_usd: s, monthly_budget_usd: t.monthly_budget_usd, budget_state: budgetState(s, t.monthly_budget_usd) };
  });
}

export async function getTeam(id: string): Promise<TeamSummary> {
  const t = (await listTeams()).find((x) => x.id === id);
  if (!t) throw notFound(`team ${id}`);
  return t;
}

export async function setBudget(user: Identity, id: string, budget: number | null): Promise<TeamSummary> {
  if (!user.is_admin) {
    throw new ServiceError('forbidden', 'Only admins can change team budgets', { action: 'set_budget', required_roles: ['admin'], your_role: user.is_guest ? 'guest' : 'member' });
  }
  if (budget !== null && (!Number.isFinite(budget) || budget < 0 || budget > 100_000)) throw new ServiceError('bad_request', 'budget must be between 0 and 100000');
  const row = await ent.setTeamBudget(id, budget);
  if (!row) throw notFound(`team ${id}`);
  await ent.auditAuthz({ actor: user.id, action: 'team.set_budget', target: id, team_id: id, actor_role: 'admin', allowed: true, detail: { budget } });
  resetTeamSpendCache();
  return getTeam(id);
}

/** Pure: throw the team budget error when spend >= budget. */
export function assertTeamBudgetPure(team: { id: string; name: string; monthly_budget_usd: number | null }, spend: number): void {
  if (team.monthly_budget_usd === null) return;
  if (spend >= team.monthly_budget_usd) {
    throw new ServiceError('budget_exceeded', teamBudgetMessage(team.name, spend, team.monthly_budget_usd), {
      scope: 'team',
      team: team.id,
      spend_usd: round(spend),
      budget_usd: team.monthly_budget_usd,
    });
  }
}

/** 402 "Team budget reached" for the agent's team. DB errors let the call through (guard rail, not an outage). */
export async function requireTeamBudget(agent: string): Promise<void> {
  let team: ent.TeamRow | null = null;
  let spend = 0;
  try {
    const teamId = await ent.agentTeamId(agent);
    if (!teamId) return;
    team = await ent.getTeam(teamId);
    spend = (await teamSpend())[teamId] ?? 0;
  } catch (e) {
    console.error('[team-budget] could not read team spend:', e instanceof Error ? e.message : e);
    return;
  }
  if (team) assertTeamBudgetPure(team, spend);
}

/** Spec `team:` must name an existing team id (with did-you-mean). */
export async function validateSpecTeam(team: string | null): Promise<string | null> {
  if (!team) return null;
  const ids = (await ent.listTeams()).map((t) => t.id);
  const err = teamError(team, ids);
  if (err) throw new ServiceError('invalid_spec', err, [{ path: 'team', message: err }]);
  return team;
}
