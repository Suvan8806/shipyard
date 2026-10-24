/**
 * Seed the 8 agents: `npm run seed` (needs SUPABASE_DB_URL), or `npx tsx scripts/seed-agents.ts --sql`
 * to print idempotent SQL (agents upsert + sys.accounts reconcile) for the Supabase SQL editor / MCP.
 * Reads agents/<name>/spec.yaml, agents/<name>/scenarios/*.yaml, team/owner from agents/_org.yaml.
 * Flags: --no-accounts  skip reconciling sys.accounts to the 20 canonical accounts.
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { AGENTS_DIR, hasFlag, jsonb, lit, loadAgents, loadEnvLocal, loadPersonaAccounts, txn, type AgentSource } from './_shared';
import { CANONICAL_ACCOUNTS, GOOD_SUPPORT_SPEC } from '../lib/library/reset';
import { PERSONAS, type Persona } from '../lib/library/simulate';

function checkSync(agents: AgentSource[]): void {
  const persona = loadPersonaAccounts();
  const same =
    persona.length === CANONICAL_ACCOUNTS.length &&
    persona.every((p, i) => {
      const c = CANONICAL_ACCOUNTS[i];
      return p.id === c.id && p.owner === c.owner && p.email === c.email && Number(p.balance) === c.balance &&
        Number(p.monthly_payment) === c.monthly_payment;
    });
  if (!same) console.error('WARN: lib/library/reset.ts CANONICAL_ACCOUNTS differs from agents/_personas.yaml accounts');
  const yamlPersonas = (YAML.parse(fs.readFileSync(path.join(AGENTS_DIR, '_personas.yaml'), 'utf8')) as { personas: Persona[] }).personas;
  if (JSON.stringify(yamlPersonas.map((p) => [p.name, p.account_id, p.agents, p.messages])) !==
      JSON.stringify(PERSONAS.map((p) => [p.name, p.account_id, p.agents, p.messages]))) {
    console.error('WARN: lib/library/simulate.ts PERSONAS differs from agents/_personas.yaml personas');
  }
  const support = agents.find((a) => a.name === 'support-agent');
  if (support && support.spec_yaml !== GOOD_SUPPORT_SPEC) {
    console.error('WARN: lib/library/reset.ts GOOD_SUPPORT_SPEC differs from agents/support-agent/spec.yaml');
  }
}

export function agentUpsertSql(a: AgentSource): string {
  return (
    `insert into public.agents (name, draft_spec_yaml, draft_scenarios, team, owner) values (${lit(a.name)}, ${lit(
      a.spec_yaml,
    )}, ${jsonb(a.scenarios)}, ${lit(a.team)}, ${lit(a.owner)})\n` +
    'on conflict (name) do update set draft_spec_yaml = excluded.draft_spec_yaml, draft_scenarios = excluded.draft_scenarios,\n' +
    '  team = excluded.team, owner = excluded.owner, updated_at = now();'
  );
}

export function accountsReconcileSql(): string[] {
  const ids = CANONICAL_ACCOUNTS.map((a) => lit(a.id)).join(', ');
  const values = CANONICAL_ACCOUNTS.map(
    (a) => `(${lit(a.id)}, ${lit(a.owner)}, ${lit(a.email)}, ${a.balance.toFixed(2)}, ${a.monthly_payment.toFixed(2)}, 'active')`,
  ).join(',\n  ');
  return [
    `delete from sys.accounts where id not in (${ids});`,
    `insert into sys.accounts (id, owner, email, balance, monthly_payment, status) values\n  ${values}\n` +
      'on conflict (id) do update set owner = excluded.owner, email = excluded.email, balance = excluded.balance,\n' +
      '  monthly_payment = excluded.monthly_payment, status = excluded.status;',
  ];
}

async function main() {
  const agents = loadAgents();
  checkSync(agents);
  const withAccounts = !hasFlag('no-accounts');

  if (hasFlag('sql')) {
    const stmts = [...(withAccounts ? accountsReconcileSql() : []), ...agents.map(agentUpsertSql)];
    console.log(txn(stmts));
    return;
  }

  loadEnvLocal();
  const { closeSql, sql } = await import('../lib/db');
  const repo = await import('../lib/platform/repo');
  try {
    if (withAccounts) {
      await sql.begin(async (tx) => {
        for (const s of accountsReconcileSql()) await tx.unsafe(s);
      });
      console.log(`sys.accounts reconciled to ${CANONICAL_ACCOUNTS.length} canonical rows`);
    }
    for (const a of agents) {
      await repo.upsertAgentDraft({
        name: a.name,
        draft_spec_yaml: a.spec_yaml,
        draft_scenarios: a.scenarios,
        team: a.team,
        owner: a.owner,
      });
      console.log(`seeded ${a.name.padEnd(22)} ${Object.keys(a.scenarios).length} scenarios  ${a.team ?? '-'} / ${a.owner ?? '-'}`);
    }
    console.log(`done: ${agents.length} agents`);
  } finally {
    await closeSql();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('seed-agents failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
