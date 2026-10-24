// System schema shared by the live DB (Supabase `sys` schema) and every twin.
// Keep in sync with supabase/migrations/0002_sys.sql.

export const SYS_SCHEMA_SQL = `
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
`;

export const SYS_TABLES = {
  accounts: ['id', 'owner', 'email', 'balance', 'monthly_payment', 'status'],
  credits: ['id', 'account_id', 'amount', 'reason', 'created_at'],
  deferrals: ['id', 'account_id', 'months', 'reason', 'created_at'],
  crm_notes: ['id', 'account_id', 'body', 'created_at'],
  email_outbox: ['id', 'to_addr', 'subject', 'body', 'external', 'created_at'],
  approvals: ['id', 'type', 'account_id', 'details', 'tool_args', 'status', 'created_at', 'decided_at'],
} as const;

export type SysTable = keyof typeof SYS_TABLES;

export const SYS_TABLE_NAMES = Object.keys(SYS_TABLES) as SysTable[];

export function isSysTable(name: string): name is SysTable {
  return Object.prototype.hasOwnProperty.call(SYS_TABLES, name);
}

export function isSysColumn(table: SysTable, column: string): boolean {
  return (SYS_TABLES[table] as readonly string[]).includes(column);
}
