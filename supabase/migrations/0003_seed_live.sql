-- 0003_seed_live.sql: the live system starts with 20 member accounts and no other rows (PRD 9.1).
-- A-100 Dana Lee matches the support-agent scenarios. Re-runnable: resets the account rows on conflict.

insert into sys.accounts (id, owner, email, balance, monthly_payment, status) values
  ('A-100', 'Dana Lee', 'dana@lonestarcu.org', 412.00, 412.00, 'active'),
  ('A-101', 'Marcus Villarreal', 'marcus.villarreal@lonestarcu.org', 1284.50, 325.00, 'active'),
  ('A-102', 'Priya Raman', 'priya.raman@lonestarcu.org', 0.00, 180.00, 'active'),
  ('A-103', 'Jake Whitfield', 'jake.whitfield@lonestarcu.org', 1890.25, 560.00, 'active'),
  ('A-104', 'Rosa Delgado', 'rosa.delgado@lonestarcu.org', 642.10, 215.00, 'active'),
  ('A-105', 'Tyler Brooks', 'tyler.brooks@lonestarcu.org', 955.00, 300.00, 'active'),
  ('A-106', 'Linh Nguyen', 'linh.nguyen@lonestarcu.org', 230.75, 150.00, 'active'),
  ('A-107', 'Carlos Mendoza', 'carlos.mendoza@lonestarcu.org', 1520.00, 480.00, 'active'),
  ('A-108', 'Hannah Pruitt', 'hannah.pruitt@lonestarcu.org', 75.40, 165.00, 'active'),
  ('A-109', 'DeShawn Carter', 'deshawn.carter@lonestarcu.org', 1102.60, 410.00, 'active'),
  ('A-110', 'Emily Hargrove', 'emily.hargrove@lonestarcu.org', 388.00, 220.00, 'active'),
  ('A-111', 'Javier Ortiz', 'javier.ortiz@lonestarcu.org', 1999.99, 600.00, 'active'),
  ('A-112', 'Grace Okafor', 'grace.okafor@lonestarcu.org', 512.35, 275.00, 'active'),
  ('A-113', 'Wyatt Calloway', 'wyatt.calloway@lonestarcu.org', 860.00, 340.00, 'active'),
  ('A-114', 'Sofia Castillo', 'sofia.castillo@lonestarcu.org', 145.20, 155.00, 'active'),
  ('A-115', 'Ben Thibodeaux', 'ben.thibodeaux@lonestarcu.org', 1340.80, 455.00, 'active'),
  ('A-116', 'Aaliyah Jenkins', 'aaliyah.jenkins@lonestarcu.org', 720.00, 260.00, 'active'),
  ('A-117', 'Noah Schaefer', 'noah.schaefer@lonestarcu.org', 415.55, 190.00, 'active'),
  ('A-118', 'Isabella Reyes', 'isabella.reyes@lonestarcu.org', 1675.00, 520.00, 'active'),
  ('A-119', 'Cole Harrington', 'cole.harrington@lonestarcu.org', 990.10, 365.00, 'active')
on conflict (id) do update set owner = excluded.owner, email = excluded.email, balance = excluded.balance,
  monthly_payment = excluded.monthly_payment, status = excluded.status;
