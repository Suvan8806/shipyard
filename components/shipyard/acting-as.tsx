'use client';
// "Acting as" switch (enterprise roles demo): picks a seeded user, stores it in localStorage, and api.ts sends it as
// X-Shipyard-User on every request. usePermission() mirrors the server check to disable buttons with a tooltip;
// the server still enforces (403) regardless of what the UI shows.
import { UserRound } from 'lucide-react';
import { check, type Action } from '@/lib/enterprise/roles';
import { ACTING_AS_KEY, actingAsId, getTeams, getUsers, USE_MOCKS, type Identity } from './api';
import { useData } from './use-data';

function useUsers() {
  return useData('acting-as-users', () => (USE_MOCKS ? Promise.resolve([] as Identity[]) : getUsers()));
}

export function useActingAs(): Identity | null {
  const { data } = useUsers();
  if (!data) return null;
  const id = actingAsId() ?? 'guest';
  return data.find((u) => u.id === id) ?? data[0] ?? null;
}

/** Can the acting user do `action` on the team named `teamName`? `reason` is the tooltip when not. */
export function usePermission(action: Action, teamName: string | null | undefined): { allowed: boolean; reason: string | null } {
  const me = useActingAs();
  const { data: teams } = useData('acting-as-teams', () => (USE_MOCKS ? Promise.resolve([]) : getTeams()));
  if (!me) return { allowed: true, reason: null };
  const team = teams?.find((t) => t.name === teamName || t.id === teamName) ?? null;
  const d = check(me, action, team?.id ?? null, { teamName: team?.name ?? teamName ?? null });
  return { allowed: d.allowed, reason: d.allowed ? null : (d.message ?? 'Not allowed') };
}

function roleLabel(u: Identity): string {
  if (u.is_guest) return 'demo, all teams';
  if (u.is_admin) return 'admin';
  const entries = Object.entries(u.memberships);
  return entries.length ? entries.map(([t, r]) => `${r} · ${t}`).join(', ') : 'no team';
}

export function ActingAs() {
  const { data } = useUsers();
  if (USE_MOCKS || !data || data.length === 0) return null;
  const current = actingAsId() ?? 'guest';
  const onChange = (id: string) => {
    try {
      if (id === 'guest') localStorage.removeItem(ACTING_AS_KEY);
      else localStorage.setItem(ACTING_AS_KEY, id);
    } catch {
      /* storage blocked: the switch can't persist */
    }
    window.location.reload();
  };
  return (
    <label className="flex items-center gap-2 text-xs text-sidebar-muted">
      <UserRound className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only sm:not-sr-only">Acting as</span>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 rounded-md border border-sidebar-border bg-sidebar px-1.5 py-1 text-xs text-sidebar-foreground"
        aria-label="Acting as"
      >
        {data.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} ({roleLabel(u)})
          </option>
        ))}
      </select>
    </label>
  );
}
