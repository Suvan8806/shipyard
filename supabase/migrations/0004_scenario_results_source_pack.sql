-- 0004_scenario_results_source_pack.sql: mirrors columns already live in Supabase (applied earlier by hand).
-- Idempotent; do not re-apply on prod unless a fresh project is being created.
alter table public.scenario_results
  add column if not exists source text not null default 'spec' check (source in ('spec', 'pack', 'generated')),
  add column if not exists pack text;
