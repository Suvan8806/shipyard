// Enterprise tables (supabase/migrations/0006_enterprise.sql): teams, users, memberships, team spend.
import { sql } from '../db';
import type { Identity, Role } from '../enterprise/roles';

export interface TeamRow {
  id: string;
  name: string;
  monthly_budget_usd: number | null;
}

const toTeam = (r: Record<string, unknown>): TeamRow => ({
  id: String(r.id),
  name: String(r.name),
  monthly_budget_usd: r.monthly_budget_usd === null || r.monthly_budget_usd === undefined ? null : Number(r.monthly_budget_usd),
});

export async function listTeams(): Promise<TeamRow[]> {
  const rows = await sql`select * from teams order by name`;
  return rows.map(toTeam);
}

export async function getTeam(id: string): Promise<TeamRow | null> {
  const rows = await sql`select * from teams where id = ${id}`;
  return rows[0] ? toTeam(rows[0]) : null;
}

export async function setTeamBudget(id: string, budget: number | null): Promise<TeamRow | null> {
  const rows = await sql`update teams set monthly_budget_usd = ${budget} where id = ${id} returning *`;
  return rows[0] ? toTeam(rows[0]) : null;
}

function toMemberships(rows: readonly Record<string, unknown>[]): Record<string, Role | Role[]> {
  const out: Record<string, Role | Role[]> = {};
  for (const m of rows) {
    const team = String(m.team_id);
    const role = m.role as Role;
    const prev = out[team];
    out[team] = prev === undefined ? role : [...(Array.isArray(prev) ? prev : [prev]), role];
  }
  return out;
}

export async function getUser(id: string): Promise<Identity | null> {
  const rows = await sql`select * from users where id = ${id}`;
  if (!rows[0]) return null;
  const ms = await sql`select team_id, role from memberships where user_id = ${id}`;
  const memberships = toMemberships(ms);
  return { id: String(rows[0].id), name: String(rows[0].name), is_admin: Boolean(rows[0].is_admin), memberships };
}

export async function listUsers(): Promise<Identity[]> {
  const users = await sql`select * from users order by is_admin, id`;
  const ms = await sql`select user_id, team_id, role from memberships`;
  return users.map((u) => {
    const memberships = toMemberships(ms.filter((m) => m.user_id === u.id));
    return { id: String(u.id), name: String(u.name), is_admin: Boolean(u.is_admin), memberships };
  });
}

export async function agentTeamId(agent: string): Promise<string | null> {
  const rows = await sql`select team_id from agents where name = ${agent}`;
  return rows[0]?.team_id ? String(rows[0].team_id) : null;
}

export async function setAgentTeam(agent: string, teamId: string): Promise<void> {
  await sql`update agents set team_id = ${teamId}, team = (select name from teams where id = ${teamId}) where name = ${agent}`;
}

export async function agentCountsByTeam(): Promise<Record<string, number>> {
  const rows = await sql`select team_id, count(*) as n from agents where team_id is not null group by team_id`;
  return Object.fromEntries(rows.map((r) => [String(r.team_id), Number(r.n)]));
}

/** Model spend this calendar month per team (live chats + gate/test runs), same cost rule as totalSpendUsd. */
export async function teamSpendThisMonth(): Promise<Record<string, number>> {
  const rows = await sql`
    select a.team_id, coalesce(sum(greatest(coalesce(r.cost_usd, 0), coalesce(e.c, 0))), 0) as c
    from runs r
    join agents a on a.name = r.agent
    left join (select run_id, sum(cost_usd) as c from run_events group by run_id) e on e.run_id = r.id
    where r.started_at >= date_trunc('month', now()) and a.team_id is not null
    group by a.team_id`;
  return Object.fromEntries(rows.map((r) => [String(r.team_id), Number(r.c)]));
}

export async function auditAuthz(input: {
  actor: string;
  action: string;
  target: string | null;
  team_id: string | null;
  actor_role: string;
  allowed: boolean;
  detail?: unknown;
}): Promise<void> {
  await sql`
    insert into audit_log (actor, action, target, detail, actor_role, allowed, team_id)
    values (${input.actor}, ${input.action}, ${input.target}, ${sql.json((input.detail ?? null) as never)},
            ${input.actor_role}, ${input.allowed}, ${input.team_id})`;
}

export async function agentNamesForTeam(teamId: string): Promise<string[]> {
  const rows = await sql`select name from agents where team_id = ${teamId} order by name`;
  return rows.map((r) => String(r.name));
}
