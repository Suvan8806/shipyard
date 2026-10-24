-- 0002_sys.sql: the simulated core-banking system (PRD 9.1). Same SQL as SYS_SCHEMA_SQL in lib/sysdb/schema.ts,
-- which every PGlite twin also applies. RLS on, no policies: only the server connection can use these tables.

create schema if not exists sys;
create table if not exists sys.accounts (id text primary key, owner text not null, email text not null,
  balance numeric(12,2) not null, monthly_payment numeric(12,2) not null, status text not null default 'active');
create table if not exists sys.credits (id serial primary key, account_id text not null, amount numeric(12,2) not null,
  reason text, created_at timestamptz not null default now());
create table if not exists sys.deferrals (id serial primary key, account_id text not null, months int not null,
  reason text, created_at timestamptz not null default now());
create table if not exists sys.crm_notes (id serial primary key, account_id text not null, body text not null,
  created_at timestamptz not null default now());
create table if not exists sys.email_outbox (id serial primary key, to_addr text not null, subject text, body text,
  external boolean not null, created_at timestamptz not null default now());
create table if not exists sys.approvals (id serial primary key, type text not null, account_id text, details text,
  tool_args jsonb, status text not null default 'pending', created_at timestamptz not null default now(), decided_at timestamptz);

alter table sys.accounts enable row level security;
alter table sys.credits enable row level security;
alter table sys.deferrals enable row level security;
alter table sys.crm_notes enable row level security;
alter table sys.email_outbox enable row level security;
alter table sys.approvals enable row level security;
