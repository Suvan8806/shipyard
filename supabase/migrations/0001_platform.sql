-- 0001_platform.sql: platform tables (PRD 9.2). Mirrors what is applied in Supabase project oicyziasyqufalmvoulp.
-- RLS is enabled on every table with NO policies: only the server (service role / direct DB URL) can read or write.

create table if not exists public.agents (
  name text primary key,
  current_version integer,
  draft_spec_yaml text not null,
  draft_scenarios jsonb not null default '{}'::jsonb,
  team text,
  owner text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_versions (
  agent text not null references public.agents(name) on delete cascade,
  version integer not null,
  spec_yaml text not null,
  scenarios jsonb not null default '{}'::jsonb,
  spec_hash text,
  status text not null check (status in ('running', 'live', 'blocked', 'error')),
  pass_rate real,
  total_cost_usd numeric(12,6),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (agent, version)
);
create index if not exists agent_versions_agent_status_idx on public.agent_versions (agent, status);
create index if not exists agent_versions_spec_hash_idx on public.agent_versions (spec_hash);

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  version integer,
  mode text not null check (mode in ('live', 'scenario')),
  scenario text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  cost_usd numeric(12,6) not null default 0,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  outcome text,
  final_reply text
);
create index if not exists runs_agent_version_idx on public.runs (agent, version);
create index if not exists runs_started_at_idx on public.runs (started_at desc);

create table if not exists public.run_events (
  id bigserial primary key,
  run_id uuid not null references public.runs(id) on delete cascade,
  seq integer not null,
  ts timestamptz not null default now(),
  type text not null check (type in ('model_call', 'tool_call', 'policy_block', 'approval', 'error')),
  name text,
  payload jsonb,
  tokens_in integer,
  tokens_out integer,
  cost_usd numeric(12,6),
  latency_ms integer
);
create index if not exists run_events_run_seq_idx on public.run_events (run_id, seq);

create table if not exists public.scenario_results (
  id bigserial primary key,
  agent text not null,
  version integer not null,
  scenario text not null,
  attempt integer not null default 1,
  run_id uuid,
  status text not null check (status in ('running', 'passed', 'failed', 'error')),
  assertions jsonb not null default '[]'::jsonb,
  reply_check jsonb,
  final_reply text,
  diff jsonb,
  before_snapshot jsonb,
  after_snapshot jsonb,
  created_at timestamptz not null default now(),
  unique (agent, version, scenario, attempt)
);
create index if not exists scenario_results_agent_version_idx on public.scenario_results (agent, version);
create index if not exists scenario_results_run_idx on public.scenario_results (run_id);

create table if not exists public.audit_log (
  id bigserial primary key,
  ts timestamptz not null default now(),
  actor text not null,
  action text not null,
  target text,
  detail jsonb
);
create index if not exists audit_log_ts_idx on public.audit_log (ts desc);

alter table public.agents enable row level security;
alter table public.agent_versions enable row level security;
alter table public.runs enable row level security;
alter table public.run_events enable row level security;
alter table public.scenario_results enable row level security;
alter table public.audit_log enable row level security;
