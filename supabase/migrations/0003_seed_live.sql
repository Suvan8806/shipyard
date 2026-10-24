-- 0003_seed_live.sql: the live system starts with 20 member accounts and no other rows (PRD 9.1).
-- Canonical list = agents/_personas.yaml `accounts` = lib/library/reset.ts CANONICAL_ACCOUNTS (all scenarios use these).
-- Re-runnable: removes non-canonical accounts and resets the account rows on conflict.

delete from sys.accounts where id not in ('A-100', 'A-101', 'A-102', 'A-103', 'A-104', 'A-105', 'A-106', 'A-107', 'A-108',
  'A-109', 'A-110', 'A-111', 'A-112', 'A-113', 'A-114', 'A-115', 'A-116', 'A-117', 'A-118', 'A-119');

insert into sys.accounts (id, owner, email, balance, monthly_payment, status) values
  ('A-100', 'Dana Lee', 'dana@lonestarcu.org', 412.00, 412.00, 'active'),
  ('A-101', 'Marcus Villarreal', 'marcus@lonestarcu.org', 1250.00, 375.00, 'active'),
  ('A-102', 'Rosa Delgado', 'rosa@lonestarcu.org', 640.00, 320.00, 'active'),
  ('A-103', 'Travis Whitfield', 'travis@lonestarcu.org', 905.50, 410.00, 'active'),
  ('A-104', 'Priya Raman', 'priya@lonestarcu.org', 760.25, 250.00, 'active'),
  ('A-105', 'Hector Garza', 'hector@lonestarcu.org', 1180.00, 295.00, 'active'),
  ('A-106', 'Kaylee Brooks', 'kaylee@lonestarcu.org', 88.40, 150.00, 'active'),
  ('A-107', 'Earl Thibodeaux', 'earl@lonestarcu.org', 1975.00, 560.00, 'active'),
  ('A-108', 'Mei Chen', 'mei@lonestarcu.org', 322.10, 210.00, 'active'),
  ('A-109', 'Darnell Jackson', 'darnell@lonestarcu.org', 1490.00, 480.00, 'active'),
  ('A-110', 'Lupe Herrera', 'lupe@lonestarcu.org', 515.75, 265.00, 'active'),
  ('A-111', 'Cody McAllister', 'cody@lonestarcu.org', 0.00, 175.00, 'active'),
  ('A-112', 'Grace Okafor', 'grace@lonestarcu.org', 1660.00, 600.00, 'active'),
  ('A-113', 'Wyatt Sorensen', 'wyatt@lonestarcu.org', 245.00, 245.00, 'active'),
  ('A-114', 'Esperanza Ruiz', 'esperanza@lonestarcu.org', 830.00, 330.00, 'active'),
  ('A-115', 'Bobby Nguyen', 'bobby@lonestarcu.org', 1105.60, 390.00, 'active'),
  ('A-116', 'Tammy Kowalski', 'tammy@lonestarcu.org', 470.00, 235.00, 'active'),
  ('A-117', 'Jesse Alvarado', 'jesse@lonestarcu.org', 59.00, 160.00, 'active'),
  ('A-118', 'Linda Whitfield-Pruitt', 'linda@lonestarcu.org', 0.00, 180.00, 'active'),
  ('A-119', 'Raymond Castillo', 'raymond@lonestarcu.org', 1320.00, 440.00, 'active')
on conflict (id) do update set owner = excluded.owner, email = excluded.email, balance = excluded.balance,
  monthly_payment = excluded.monthly_payment, status = excluded.status;
