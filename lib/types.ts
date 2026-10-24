// CONTRACT: shared domain types + cross-lane function signatures.
// Owned by O0. Lanes request changes via plans/status/<lane>.md; never edit directly.
import type { z } from 'zod';
import type { LanguageModel } from 'ai';
import type { SysTable } from './sysdb/schema';

// ---------- System DB ----------
export interface SystemDb {
  /** Parameterized query ($1, $2, ...). Returns plain row objects. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Run one or more statements without params (DDL, seeds). */
  exec(sql: string): Promise<void>;
  /** 'live' for the real system DB, 'twin' for scenario twins. The gate refuses to run on 'live'. */
  kind: 'live' | 'twin';
}
export type Row = Record<string, unknown>;
export type Snapshot = Record<SysTable, Row[]>;
export interface TableDiff {
  added: Row[];
  removed: Row[];
  changed: { before: Row; after: Row; columns: string[] }[];
}
/** Only tables with at least one change are present. */
export type TwinDiff = Partial<Record<SysTable, TableDiff>>;
export interface Twin {
  id: string;
  db: SystemDb;
  seed(setup: ScenarioSetup): Promise<void>;
  snapshot(): Promise<Snapshot>;
  close(): Promise<void>;
}

// ---------- Library ----------
export interface ModelProfile { model: string; temperature: number; maxOutputTokens: number }
export interface Policy {
  requiresApproval?: boolean;
  maxAmount?: number;
  maxCallsPerRun?: number;
  allowedAgents?: string[];
  blockExternalIfContains?: ('account_id' | 'balance')[];
}
export interface ToolContext { db: SystemDb; agent: string; runId: string }
export interface ToolDef<P extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  params: P;
  handler: (ctx: ToolContext, args: z.infer<P>) => Promise<unknown>;
}
export interface ToolInfo {
  name: string;
  description: string;
  /** JSON schema of the params */
  params: Record<string, unknown>;
  policy: Policy | null;
}
export interface Block { name: string; text: string }

// ---------- Spec + scenarios ----------
export interface GateConfig { min_pass_rate: number; runs_per_scenario: number }
export interface AgentSpec {
  name: string;
  goal: string;
  profile: string;
  inherit: string[];
  tools: string[];
  instructions: string;
  gate: GateConfig;
}
/** Rows may include `days_ago: N` which becomes created_at = now() - N days. */
export type ScenarioSetup = Partial<Record<SysTable, Row[]>>;
export interface Assertion {
  table?: SysTable;
  where: Record<string, string | number | boolean>;
  body_contains?: string;
  count?: number;
  count_gte?: number;
  count_lte?: number;
  sum?: string;
  lte?: number;
  gte?: number;
  eq?: number;
  reply_contains?: string;
  critical: boolean;
  label?: string;
}
export interface Scenario {
  name: string;
  description: string;
  setup: ScenarioSetup;
  conversation: { user: string }[];
  assert: Assertion[];
}
export interface ValidationError { path: string; message: string }
export interface ValidationResult { ok: boolean; errors: ValidationError[] }

// ---------- Runs ----------
export type RunMode = 'live' | 'scenario';
export type EventType = 'model_call' | 'tool_call' | 'policy_block' | 'approval' | 'error';
export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export interface RunInput {
  spec: AgentSpec;
  version: number | null;
  messages: ChatMessage[];
  db: SystemDb;
  mode: RunMode;
  scenario?: string;
  /** Tests inject the AI SDK mock model here. */
  modelOverride?: LanguageModel;
}
export interface RunResult {
  run_id: string;
  final_reply: string;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
  outcome: 'ok' | 'error';
  events_count: number;
}
export interface RunEvent {
  seq: number;
  ts: string;
  type: EventType;
  name: string | null;
  payload: unknown;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  latency_ms: number | null;
}
export interface RunRow {
  id: string;
  agent: string;
  version: number | null;
  mode: RunMode;
  scenario: string | null;
  started_at: string;
  ended_at: string | null;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
  outcome: string | null;
  final_reply: string | null;
}

// ---------- Gate ----------
export type VersionStatus = 'running' | 'live' | 'blocked' | 'error';
export type ScenarioStatus = 'running' | 'passed' | 'failed' | 'error';
export interface AssertionOutcome {
  assertion: Assertion;
  passed: boolean;
  expected: string;
  actual: string;
  critical: boolean;
}
export interface ReplyCheck { passed: boolean; rationale: string }
export interface ScenarioResultSummary {
  scenario: string;
  attempt: number;
  status: ScenarioStatus;
  run_id: string | null;
  assertions: AssertionOutcome[];
  reply_check: ReplyCheck | null;
  final_reply: string | null;
  diff: TwinDiff | null;
}
export interface GateResult {
  agent: string;
  version: number;
  status: VersionStatus;
  pass_rate: number | null;
  total_cost_usd: number | null;
  started_at: string;
  finished_at: string | null;
  /** The version serving traffic right now (for the "v1 still serving" banner). */
  current_version: number | null;
  scenario_names: string[];
  results: ScenarioResultSummary[];
}

// ---------- Cross-lane function signatures (stubbed in W0, implemented by the owning lane) ----------
// Lane A
export type ValidateSpecFn = (
  specYaml: string,
  scenarios: Record<string, string>,
) => ValidationResult & { spec?: AgentSpec; scenarios?: Scenario[] };   // lib/spec/validate.ts
export type RunAgentFn = (input: RunInput) => Promise<RunResult>;      // lib/runtime/runner.ts
export type LiveDbFn = () => SystemDb;                                 // lib/sysdb/live.ts
export type ExecuteApprovedCallFn = (approvalId: number, db: SystemDb) => Promise<unknown>; // lib/runtime/approvals.ts
// Lane B
export type CreateTwinFn = () => Promise<Twin>;                        // lib/twins/twin.ts
export type DiffSnapshotsFn = (before: Snapshot, after: Snapshot) => TwinDiff; // lib/twins/diff.ts
export type EvaluateAssertionsFn = (
  db: SystemDb,
  assertions: Assertion[],
  finalReply: string,
) => Promise<AssertionOutcome[]>;                                      // lib/gate/assertions.ts
export type RunGateFn = (args: {
  agent: string;
  version: number;
  spec: AgentSpec;
  scenarios: Scenario[];
  specHash: string;
}) => Promise<GateResult>;                                             // lib/gate/gate.ts
