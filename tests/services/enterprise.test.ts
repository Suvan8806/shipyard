import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/platform/enterprise-repo', () => ({
  agentTeamId: vi.fn(async (agent: string) => (agent === 'branch-hours-agent' ? 'branch-ops' : agent === 'support-agent' ? 'member-support' : null)),
  getTeam: vi.fn(async (id: string) =>
    id === 'branch-ops'
      ? { id, name: 'Branch Ops', monthly_budget_usd: 0.015 }
      : { id, name: 'Member Support', monthly_budget_usd: 3 },
  ),
  teamSpendThisMonth: vi.fn(async () => ({ 'branch-ops': 0.018, 'member-support': 1.2 })),
  listTeams: vi.fn(async () => [
    { id: 'member-support', name: 'Member Support', monthly_budget_usd: 3 },
    { id: 'branch-ops', name: 'Branch Ops', monthly_budget_usd: 0.015 },
  ]),
}));

import { ALLOWED, GUEST, budgetState, check, specTeam, teamError, type Identity } from '@/lib/enterprise/roles';
import { requireTeamBudget, resetTeamSpendCache, validateSpecTeam } from '@/lib/services/teams';

const user = (id: string, role?: 'viewer' | 'developer' | 'owner' | 'approver', is_admin = false): Identity => ({
  id,
  name: id,
  is_admin,
  memberships: role ? { 'member-support': role } : {},
});

describe('permission table', () => {
  const cases: [string, Identity, keyof typeof ALLOWED, boolean][] = [
    ['developer cannot deploy', user('marcus', 'developer'), 'deploy', false],
    ['owner can deploy', user('priya', 'owner'), 'deploy', true],
    ['owner can roll back', user('priya', 'owner'), 'rollback', true],
    ['developer can edit spec', user('marcus', 'developer'), 'edit_spec', true],
    ['developer can run tests', user('marcus', 'developer'), 'run_tests', true],
    ['viewer cannot edit spec', user('v', 'viewer'), 'edit_spec', false],
    ['approver can approve', user('elena', 'approver'), 'approve', true],
    ['approver cannot deploy', user('elena', 'approver'), 'deploy', false],
    ['owner cannot edit library', user('priya', 'owner'), 'edit_library', false],
    ['admin can edit library', user('admin', undefined, true), 'edit_library', true],
    ['non-member cannot deploy', user('stranger'), 'deploy', false],
    ['guest can deploy (public demo)', GUEST, 'deploy', true],
    ['guest cannot edit library', GUEST, 'edit_library', false],
  ];
  it.each(cases)('%s', (_label, u, action, expected) => {
    expect(check(u, action, 'member-support', { teamName: 'Member Support' }).allowed).toBe(expected);
  });

  it('denial carries required roles, your role and a tooltip message', () => {
    const d = check(user('marcus', 'developer'), 'deploy', 'member-support', { teamName: 'Member Support' });
    expect(d).toMatchObject({ allowed: false, code: 'forbidden', your_role: 'developer', required_roles: ['owner', 'admin'] });
    expect(d.message).toBe('Only owners of Member Support can deploy');
  });

  it('agents with no team are open (fresh drafts), except library edits', () => {
    expect(check(user('marcus'), 'deploy', null).allowed).toBe(true);
    expect(check(user('marcus'), 'edit_library', null).allowed).toBe(false);
  });
});

describe('separation of duties', () => {
  it('the requester/deployer cannot approve their own held action, even as approver or admin', () => {
    expect(check(user('elena', 'approver'), 'approve', 'member-support', { requestedBy: 'elena' })).toMatchObject({
      allowed: false,
      code: 'self_approval_not_allowed',
    });
    expect(check(user('admin', undefined, true), 'approve', 'member-support', { requestedBy: 'admin' }).allowed).toBe(false);
  });
  it('someone else can approve', () => {
    expect(check(user('elena', 'approver'), 'approve', 'member-support', { requestedBy: 'priya' }).allowed).toBe(true);
  });
});

describe('team budget', () => {
  beforeEach(() => resetTeamSpendCache());

  it('refuses the over-budget team with "Team budget reached"', async () => {
    await expect(requireTeamBudget('branch-hours-agent')).rejects.toMatchObject({
      code: 'budget_exceeded',
      message: expect.stringContaining('Team budget reached for Branch Ops'),
    });
  });
  it('leaves other teams unaffected', async () => {
    await expect(requireTeamBudget('support-agent')).resolves.toBeUndefined();
  });
  it('budget states: 80% warning, 100% reached', () => {
    expect(budgetState(0.5, 1)).toBe('ok');
    expect(budgetState(0.8, 1)).toBe('warning');
    expect(budgetState(1, 1)).toBe('reached');
    expect(budgetState(5, null)).toBe('none');
  });
});

describe('spec team validation', () => {
  it('reads a top-level team', () => {
    expect(specTeam('name: x\nteam: member-support\ngoal: y')).toBe('member-support');
    expect(specTeam('name: x\ngoal: y')).toBeNull();
  });
  it('suggests the closest team', () => {
    expect(teamError('member-suport', ['member-support', 'branch-ops'])).toBe('unknown team "member-suport" (did you mean "member-support"?)');
    expect(teamError('member-support', ['member-support'])).toBeNull();
  });
  it('validateSpecTeam rejects unknown teams with invalid_spec', async () => {
    await expect(validateSpecTeam('brnch-ops')).rejects.toMatchObject({ code: 'invalid_spec', message: expect.stringContaining('did you mean "branch-ops"') });
    await expect(validateSpecTeam(null)).resolves.toBeNull();
  });
});
