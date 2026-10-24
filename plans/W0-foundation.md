# W0: Foundation (O0 only, serial, about 1.5 h)

**Goal:** give every lane a deployed skeleton, frozen contracts and stubs, so four orchestrators can code at once without waiting on each other.
**Done when:** `npm run build` passes, the Vercel production URL serves `/api/health` → `{ok:true}` and `/api/agents` → fixture data, everything is committed on `main`, four worktrees exist, and `plans/status/lane-{A,B,C,D}.md` are initialized.

Skills: `vercel:nextjs`, `vercel:shadcn`, `supabase`, `supabase-postgres-best-practices`, `vercel:deploy`, `vercel:env`, `ecc:contract-first`.

---

## F1. Scaffold (15 min)
`create-next-app` refuses a non-empty folder, so move the docs aside first:
```bash
cd hackathon
mv shipyard shipyard-docs
npx create-next-app@latest shipyard --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes
mv shipyard-docs/* shipyard/ && rmdir shipyard-docs
cd shipyard
npx shadcn@latest init -d
npx shadcn@latest add button card badge table tabs textarea input dialog sonner separator scroll-area tooltip skeleton alert dropdown-menu sheet
npm i @supabase/supabase-js postgres @electric-sql/pglite ai @ai-sdk/anthropic @ai-sdk/gateway zod yaml mcp-handler @modelcontextprotocol/sdk lucide-react commander
npm i -D vitest tsx @types/node
```
- Check current package names and versions with the `vercel:ai-sdk` and `vercel:nextjs` skills. If `mcp-handler` was renamed, use what the docs say.
- `next.config.ts`: `serverExternalPackages: ['@electric-sql/pglite']`. If PGlite's wasm/data files don't get traced, also add `outputFileTracingIncludes` for `node_modules/@electric-sql/pglite/dist/**` on the api routes.
- `package.json` scripts: `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`, `"seed": "tsx scripts/seed-agents.ts"`, `"seed:history": "tsx scripts/seed-history.ts"`, `"simulate": "tsx scripts/simulate-traffic.ts"`, `"reset-live": "tsx scripts/reset-live.ts"`. The platform migration includes `agents.team` and `agents.owner` (PRD 9.2).
- `.gitignore` already covers `.env*`. Confirm it, then `git init`, `git add -A` and commit `chore: scaffold`.

## F2. Supabase (20 min; can run as a subagent in parallel with F3)
1. Run `list_projects` and reuse "Suvan8806's Project" if it's empty; otherwise `create_project` named `shipyard`. Get the URL and keys (`get_project_url`, `get_publishable_keys`), and the service-role key and pooler URL from the dashboard. Write them to `.env.local`.
2. Apply three migrations with `apply_migration`, and mirror each into `supabase/migrations/`:
   - `0001_platform.sql`: the platform tables from PRD 9.2, with indexes on `runs(agent,version)`, `run_events(run_id,seq)`, `scenario_results(agent,version)` and `agent_versions(agent,status)`. Enable RLS on all of them, with an anon `select` policy only on `agent_versions` and `scenario_results` (optional Realtime).
   - `0002_sys.sql`: the `sys` schema from PRD 9.1 (exactly the SQL in `lib/sysdb/schema.ts`), with RLS enabled.
   - `0003_seed_live.sql`: 20 accounts, A-100 to A-119. A-100 is Dana Lee (`dana@lonestarcu.org`, 412.00/412.00), matching the scenarios. Use plausible Texan names, balances of 0–2000 and payments of 150–600.
3. `generate_typescript_types` → `lib/database.types.ts`. Run `get_advisors` and fix anything critical.

## F3. Contracts (25 min; O0 writes these personally, since they're the most important files in the repo)
### `lib/sysdb/schema.ts`
```ts
export const SYS_SCHEMA_SQL = `...exact SQL from PRD 9.1...`;
export const SYS_TABLES = {
  accounts: ['id','owner','email','balance','monthly_payment','status'],
  credits: ['id','account_id','amount','reason','created_at'],
  deferrals: ['id','account_id','months','reason','created_at'],
  crm_notes: ['id','account_id','body','created_at'],
  email_outbox: ['id','to_addr','subject','body','external','created_at'],
  approvals: ['id','type','account_id','details','tool_args','status','created_at','decided_at'],
} as const;
export type SysTable = keyof typeof SYS_TABLES;
```

### `lib/types.ts` (domain types + cross-lane signatures; start from this)
```ts
import type { z } from 'zod';
import type { SysTable } from './sysdb/schema';

// ---------- System DB ----------
export interface SystemDb {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
}
export type Snapshot = Record<SysTable, Record<string, unknown>[]>;
export interface TableDiff { added: Record<string, unknown>[]; removed: Record<string, unknown>[];
  changed: { before: Record<string, unknown>; after: Record<string, unknown>; columns: string[] }[] }
export type TwinDiff = Partial<Record<SysTable, TableDiff>>;   // only tables with changes
export interface Twin { id: string; db: SystemDb; seed(setup: ScenarioSetup): Promise<void>;
  snapshot(): Promise<Snapshot>; close(): Promise<void> }

// ---------- Library ----------
export interface ModelProfile { model: string; temperature: number; maxOutputTokens: number }
export interface Policy { requiresApproval?: boolean; maxAmount?: number; maxCallsPerRun?: number;
  allowedAgents?: string[]; blockExternalIfContains?: ('account_id' | 'balance')[] }
export interface ToolContext { db: SystemDb; agent: string; runId: string }
export interface ToolDef<P extends z.ZodTypeAny = z.ZodTypeAny> { name: string; description: string;
  params: P; handler: (ctx: ToolContext, args: z.infer<P>) => Promise<unknown> }
export interface ToolInfo { name: string; description: string; params: Record<string, unknown> /* JSON schema */; policy: Policy | null }
export interface Block { name: string; text: string }

// ---------- Spec + scenarios ----------
export interface GateConfig { min_pass_rate: number; runs_per_scenario: number }
export interface AgentSpec { name: string; goal: string; profile: string; inherit: string[]; tools: string[];
  instructions: string; gate: GateConfig }
export type ScenarioSetup = Partial<Record<SysTable, Record<string, unknown>[]>>; // rows may use days_ago
export interface Assertion { table?: SysTable; where: Record<string, string | number | boolean>; body_contains?: string;
  count?: number; count_gte?: number; count_lte?: number; sum?: string; lte?: number; gte?: number; eq?: number;
  reply_contains?: string; critical: boolean; label?: string }
export interface Scenario { name: string; description: string; setup: ScenarioSetup;
  conversation: { user: string }[]; assert: Assertion[] }
export interface ValidationError { path: string; message: string }
export interface ValidationResult { ok: boolean; errors: ValidationError[] }

// ---------- Runs ----------
export type RunMode = 'live' | 'scenario';
export type EventType = 'model_call' | 'tool_call' | 'policy_block' | 'approval' | 'error';
export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export interface RunInput { spec: AgentSpec; version: number | null; messages: ChatMessage[]; db: SystemDb;
  mode: RunMode; scenario?: string;
  modelOverride?: import('ai').LanguageModel }   // tests inject the AI SDK mock model (Lane B, B8)
export interface RunResult { run_id: string; final_reply: string; cost_usd: number; tokens_in: number;
  tokens_out: number; outcome: 'ok' | 'error'; events_count: number }
export interface RunEvent { seq: number; ts: string; type: EventType; name: string | null; payload: unknown;
  tokens_in: number | null; tokens_out: number | null; cost_usd: number | null; latency_ms: number | null }

// ---------- Gate ----------
export type VersionStatus = 'running' | 'live' | 'blocked' | 'error';
export interface AssertionOutcome { assertion: Assertion; passed: boolean; expected: string; actual: string; critical: boolean }
export interface ReplyCheck { passed: boolean; rationale: string }
export interface ScenarioResultSummary { scenario: string; attempt: number; status: 'running' | 'passed' | 'failed' | 'error';
  run_id: string | null; assertions: AssertionOutcome[]; reply_check: ReplyCheck | null; final_reply: string | null;
  diff: TwinDiff | null }
export interface GateResult { agent: string; version: number; status: VersionStatus; pass_rate: number | null;
  total_cost_usd: number | null; results: ScenarioResultSummary[] }

// ---------- Cross-lane function signatures (stubs in W0, implemented by the owning lane) ----------
// Lane A
export type ValidateSpecFn = (specYaml: string, scenarios: Record<string, string>) =>
  ValidationResult & { spec?: AgentSpec; scenarios?: Scenario[] };          // lib/spec/validate.ts
export type RunAgentFn = (input: RunInput) => Promise<RunResult>;             // lib/runtime/runner.ts
export type LiveDbFn = () => SystemDb;                                        // lib/sysdb/live.ts
export type ExecuteApprovedCallFn = (approvalId: number, db: SystemDb) => Promise<unknown>; // lib/runtime/approvals.ts
// Lane B
export type CreateTwinFn = () => Promise<Twin>;                               // lib/twins/twin.ts
export type DiffSnapshotsFn = (before: Snapshot, after: Snapshot) => TwinDiff;  // lib/twins/diff.ts
export type EvaluateAssertionsFn = (db: SystemDb, assertions: Assertion[], finalReply: string) => Promise<AssertionOutcome[]>; // lib/gate/assertions.ts
export type RunGateFn = (args: { agent: string; version: number; spec: AgentSpec; scenarios: Scenario[] }) => Promise<GateResult>; // lib/gate/gate.ts
```

### `lib/contracts/api.ts`
Zod schemas plus inferred types for every route body and response in PRD section 13: `AgentSummary`, `AgentDetail`, `CreateAgentBody`, `PutSpecBody`, `DeployResponse`, `ChatBody`, `ChatResponse`, `RunTrace`, `Approval`, `DecisionBody`, `AuditRow`, `LibraryResponse` and `ApiError`. Reuse the types from `lib/types.ts` (`GateResult`, `ValidationResult`). Lanes C and D both import from here.

### `.env.example`
Copy it from PRD section 4.

## F4. Platform repo (20 min; can run as a subagent once F2 + F3 are done)
`lib/supabase/admin.ts` is a server-only service-role client (`import 'server-only'`). `lib/platform/repo.ts` contains small typed functions and nothing clever:
`getAgent, listAgents, upsertAgentDraft, setCurrentVersion, nextVersion, createVersion, finishVersion, listVersions, getVersion, createRun, finishRun, appendEvent (seq auto), getRun, listEvents, upsertScenarioResult, listScenarioResults, audit, listAudit, countDeploysSince`.

## F5. Stubs + fixtures (20 min; subagent, parallel with F4)
- One file per cross-lane function at the paths in the `lib/types.ts` comments. Each exports the typed function and either returns a fixture or throws `new Error('not implemented: <lane>')`. `runGate` and `runAgent` stubs return fixtures, so C and D can work end-to-end on fake data.
- `lib/mock/fixtures.ts` holds contract-valid examples typed with `satisfies`: 2 agents, a live `GateResult` (7 passed), a blocked `GateResult` (`second-credit-this-month` failed with reply_check passed and a diff of 1 added credits row), a `RunTrace` with 6 events including a policy_block, 2 approvals and 5 audit rows. **Lane D builds the whole UI from these, so make them realistic.**
- Route stubs for every endpoint in PRD section 13 under `app/api/**` return fixtures. **Ownership of `app/api/**` moves to Lane C after F6.**

## F6. Deploy + hand-off (15 min)
1. `npm run build` → fix → `vercel link` → `vercel:env` to add every var from `.env.local` to production and preview → `vercel --prod`. Check `/api/health` on the production URL.
2. Commit `feat: foundation contracts, stubs, deployed skeleton`.
3. Write `plans/status/lane-{A,B,C,D,E}.md` from the template in `plans/README.md`, then commit.
4. Create the worktrees and launch the orchestrators (`plans/README.md` steps 2–3).
5. Update PLAN.md (F1–F6 done, production URL at the top), then start `lane-E-content.md`.

### Parallelism inside W0
```
F1 ──► F3 (O0) ───────────┬──► F5 (subagent: stubs+fixtures) ──┐
   └─► F2 (subagent: supabase) ─► F4 (subagent: repo) ─────────┴──► F6 (O0)
```
Subagent prompt template for W0 (fill in the parts that change):
```
Goal: <F2|F4|F5> for Shipyard foundation (plans/W0-foundation.md section <x>).
Owns: <exact files>. Must not: edit lib/types.ts, lib/contracts/api.ts, package.json, or commit.
Contract: lib/types.ts, lib/contracts/api.ts, lib/sysdb/schema.ts, PRD.md section 9.
Skills: <supabase + supabase-postgres-best-practices | vercel:nextjs>.
Done when: npx tsc --noEmit passes; <F2: list_tables shows all tables + 20 accounts; advisors clean |
F4: a scratch script creates and reads back an agent row | F5: npm run build passes, /api/agents returns fixtures>.
Report: files changed, how verified, open questions. Hackathon mode: working beats elegant, no tests.
```
