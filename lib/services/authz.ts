// Identity (X-Shipyard-User header) + role checks with audit. No header = the public demo `guest` (owner rights on
// every team) so the existing public demo keeps working; the dashboard "Acting as" switch sends real users.
import * as ent from '../platform/enterprise-repo';
import { GUEST, check, type Action, type Identity } from '../enterprise/roles';
import { ServiceError } from './errors';

const USER_RE = /^[a-z0-9_-]{1,40}$/;
const CACHE_MS = 10_000;
const cache = new Map<string, { at: number; user: Identity | null }>();

async function loadUser(id: string): Promise<Identity | null> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.user;
  const user = await ent.getUser(id);
  cache.set(id, { at: Date.now(), user });
  return user;
}

/** Resolve a user id (header value or MCP env). Empty/'guest' -> GUEST. Unknown -> 401. */
export async function resolveUserId(raw: string | null | undefined): Promise<Identity> {
  const id = (raw ?? '').trim().toLowerCase();
  if (!id || id === 'guest') return GUEST;
  if (!USER_RE.test(id)) throw new ServiceError('unauthorized', 'invalid X-Shipyard-User');
  const user = await loadUser(id);
  if (!user) throw new ServiceError('unauthorized', `unknown user "${id}"`);
  return user;
}

export function resolveUser(req: Request): Promise<Identity> {
  return resolveUserId(req.headers.get('x-shipyard-user'));
}

/** The identity MCP tools act as (SHIPYARD_MCP_USER, default priya). */
export function mcpUser(): Promise<Identity> {
  return resolveUserId(process.env.SHIPYARD_MCP_USER ?? 'priya');
}

async function teamName(teamId: string | null): Promise<string | null> {
  if (!teamId) return null;
  try {
    return (await ent.getTeam(teamId))?.name ?? teamId;
  } catch {
    return teamId;
  }
}

async function record(user: Identity, action: Action, target: string | null, teamId: string | null, role: string, allowed: boolean, detail?: unknown) {
  try {
    await ent.auditAuthz({ actor: user.id, action: `authz.${action}`, target, team_id: teamId, actor_role: role, allowed, detail });
  } catch (e) {
    console.error('[authz] audit failed:', e instanceof Error ? e.message : e);
  }
}

/**
 * Throws 403 {code:'forbidden', details:{action, required_roles, your_role}} when `user` can't do `action` on
 * the team. Every attempt (allowed or denied) is written to audit_log with actor_role + allowed.
 */
export async function requireRole(
  user: Identity,
  action: Action,
  teamId: string | null,
  opts: { target?: string | null; requestedBy?: string | null } = {},
): Promise<void> {
  const d = check(user, action, teamId, { teamName: await teamName(teamId), requestedBy: opts.requestedBy });
  await record(user, action, opts.target ?? null, teamId, d.your_role, d.allowed, d.allowed ? undefined : { code: d.code });
  if (d.allowed) return;
  const details = { action, required_roles: d.required_roles, your_role: d.your_role, team: teamId };
  if (d.code === 'self_approval_not_allowed') {
    throw new ServiceError('forbidden', d.message ?? 'self approval not allowed', { ...details, reason: 'self_approval_not_allowed' });
  }
  throw new ServiceError('forbidden', d.message ?? 'forbidden', details);
}

/** requireRole on the agent's team (agents.team_id). */
export async function requireAgentRole(user: Identity, action: Action, agent: string): Promise<void> {
  const teamId = await ent.agentTeamId(agent).catch(() => null);
  await requireRole(user, action, teamId, { target: agent });
}

/** Team that owns held approvals (sys.approvals has no agent column; the approval tools belong to support-agent). */
export const APPROVAL_TEAM = process.env.SHIPYARD_APPROVAL_TEAM ?? 'member-support';
