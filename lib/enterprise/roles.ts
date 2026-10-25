// Enterprise roles: pure permission table + checks (no DB). Used by lib/services/authz.ts, the UI and tests.
export const ROLES = ['viewer', 'developer', 'owner', 'approver'] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = ['edit_spec', 'run_tests', 'deploy', 'rollback', 'approve', 'edit_library'] as const;
export type Action = (typeof ACTIONS)[number];

/** Team roles allowed to perform each action. Admins can do everything; edit_library is admin-only. */
export const ALLOWED: Record<Action, readonly Role[]> = {
  edit_spec: ['developer', 'owner'],
  run_tests: ['developer', 'owner'],
  deploy: ['owner'],
  rollback: ['owner'],
  approve: ['approver'],
  edit_library: [],
};

export interface Identity {
  id: string;
  name: string;
  is_admin: boolean;
  /** team id -> role. */
  memberships: Record<string, Role>;
  /** The public demo user (no X-Shipyard-User header): owner + approver rights on every team. */
  is_guest?: boolean;
}

export const GUEST: Identity = { id: 'guest', name: 'Guest (demo)', is_admin: false, memberships: {}, is_guest: true };

export function roleFor(user: Identity, teamId: string | null): Role | 'admin' | 'guest' | null {
  if (user.is_admin) return 'admin';
  if (user.is_guest) return 'guest';
  if (!teamId) return null;
  return user.memberships[teamId] ?? null;
}

export interface Decision {
  allowed: boolean;
  action: Action;
  team_id: string | null;
  your_role: string;
  required_roles: string[];
  code?: 'forbidden' | 'self_approval_not_allowed';
  message?: string;
}

const ACTION_VERB: Record<Action, string> = {
  edit_spec: 'edit specs',
  run_tests: 'run tests',
  deploy: 'deploy',
  rollback: 'roll back',
  approve: 'approve held actions',
  edit_library: 'edit the tool library',
};

export function requiredRoles(action: Action): string[] {
  return [...ALLOWED[action], 'admin'];
}

/** Human message used by the API 403 and the dashboard tooltip. */
export function deniedMessage(action: Action, teamName: string | null): string {
  if (action === 'edit_library') return 'Only admins can edit the tool library';
  const roles = ALLOWED[action].map((r) => `${r}s`).join(' or ');
  const team = teamName ?? 'this team';
  return `Only ${roles} of ${team} can ${ACTION_VERB[action]}`;
}

/**
 * Can `user` do `action` on team `teamId`? Separation of duties: for 'approve', the person who requested or
 * deployed the held action (`requestedBy`) can never approve it, admins included.
 */
export function check(
  user: Identity,
  action: Action,
  teamId: string | null,
  opts: { teamName?: string | null; requestedBy?: string | null } = {},
): Decision {
  const role = roleFor(user, teamId);
  const base = { action, team_id: teamId, your_role: role ?? 'none', required_roles: requiredRoles(action) };
  if (action === 'approve' && opts.requestedBy && opts.requestedBy === user.id) {
    return { ...base, allowed: false, code: 'self_approval_not_allowed', message: 'You requested or deployed this action, so someone else must approve it (separation of duties)' };
  }
  // Agents not yet assigned to a team (freshly created drafts) are open to everyone except for library edits.
  const unassigned = teamId === null && action !== 'edit_library' && action !== 'approve';
  const allowed =
    unassigned ||
    role === 'admin' ||
    (role === 'guest' && action !== 'edit_library') ||
    (role !== null && role !== 'guest' && (ALLOWED[action] as readonly string[]).includes(role));
  return allowed ? { ...base, allowed: true } : { ...base, allowed: false, code: 'forbidden', message: deniedMessage(action, opts.teamName ?? teamId) };
}

// ---------- team validation (spec `team:`) ----------
function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Returns null when `team` is a known team id, otherwise an error message with a did-you-mean hint. */
export function teamError(team: string, known: readonly string[]): string | null {
  if (known.includes(team)) return null;
  let best = '';
  let bestD = Infinity;
  for (const k of known) {
    const d = levenshtein(team.toLowerCase(), k);
    if (d < bestD) [best, bestD] = [k, d];
  }
  const hint = best && bestD <= Math.max(2, Math.floor(team.length / 3)) ? ` (did you mean "${best}"?)` : '';
  return `unknown team "${team}"${hint}`;
}

/** Top-level `team:` in a spec YAML, if any. */
export function specTeam(yaml: string): string | null {
  const m = /^team:\s*["']?([^"'\n#]+?)["']?\s*(#.*)?$/m.exec(yaml);
  return m ? m[1].trim() : null;
}

// ---------- team budget ----------
export type BudgetState = 'ok' | 'warning' | 'reached' | 'none';

export function budgetState(spend: number, budget: number | null): BudgetState {
  if (budget === null || budget === undefined) return 'none';
  if (spend >= budget) return 'reached';
  if (spend >= budget * 0.8) return 'warning';
  return 'ok';
}

export function teamBudgetMessage(teamName: string, spend: number, budget: number): string {
  return `Team budget reached for ${teamName} ($${spend.toFixed(3)} of $${budget.toFixed(3)} this month). Ask an admin to raise it.`;
}
