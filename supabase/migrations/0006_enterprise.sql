-- Enterprise: teams, users, memberships (roles), team budgets, audit allowed/denied. Idempotent.
create table if not exists public.teams (
  id text primary key,
  name text not null,
  monthly_budget_usd numeric
);

create table if not exists public.users (
  id text primary key,
  name text not null,
  is_admin boolean not null default false
);

create table if not exists public.memberships (
  user_id text not null references public.users(id) on delete cascade,
  team_id text not null references public.teams(id) on delete cascade,
  role text not null check (role in ('viewer', 'developer', 'owner', 'approver')),
  primary key (user_id, team_id)
);

alter table public.teams enable row level security;
alter table public.users enable row level security;
alter table public.memberships enable row level security;

alter table public.audit_log add column if not exists actor_role text;
alter table public.audit_log add column if not exists allowed boolean;
alter table public.audit_log add column if not exists team_id text;

alter table public.agents add column if not exists team_id text references public.teams(id);

insert into public.teams (id, name, monthly_budget_usd) values
  ('platform', 'Platform', 5),
  ('member-support', 'Member Support', 3),
  ('collections', 'Collections', 1),
  ('card-services', 'Card Services', 1),
  ('lending', 'Lending', 1),
  ('fraud-ops', 'Fraud Ops', 0.06),
  ('branch-ops', 'Branch Ops', 0.015)
on conflict (id) do update set name = excluded.name, monthly_budget_usd = excluded.monthly_budget_usd;

insert into public.users (id, name, is_admin) values
  ('priya', 'Priya Shah', false),
  ('marcus', 'Marcus Lee', false),
  ('elena', 'Elena Ruiz', false),
  ('admin', 'Admin', true),
  ('sherry', 'Sherry Lindqvist', false),
  ('maya', 'Maya Ortiz', false)
on conflict (id) do update set name = excluded.name, is_admin = excluded.is_admin;

insert into public.memberships (user_id, team_id, role) values
  ('priya', 'member-support', 'owner'),
  ('priya', 'collections', 'owner'),
  ('marcus', 'member-support', 'developer'),
  ('elena', 'member-support', 'approver'),
  ('sherry', 'branch-ops', 'owner'),
  ('maya', 'platform', 'owner'),
  ('maya', 'collections', 'developer')
on conflict do nothing;

update public.agents a set team_id = t.id
from public.teams t
where a.team = t.name and a.team_id is distinct from t.id;

create index if not exists agents_team_id_idx on public.agents (team_id);

-- A member can hold more than one role on a team (priya: owner + approver of Member Support, so the MCP user can
-- decide approvals). Widen the primary key to (user_id, team_id, role).
alter table public.memberships drop constraint if exists memberships_pkey;
alter table public.memberships add primary key (user_id, team_id, role);
insert into public.memberships (user_id, team_id, role) values ('priya', 'member-support', 'approver')
on conflict do nothing;
