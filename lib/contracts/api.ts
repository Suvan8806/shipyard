// CONTRACT: request/response shapes for every REST route (PRD section 13).
// Provider: Lane C (app/api/**, lib/services/**). Consumers: Lane D (components/shipyard/api.ts), MCP, CLI.
// Owned by O0. Response bodies on success are the data itself; errors use ApiError.
import { z } from 'zod';
import type {
  GateResult,
  RunEvent,
  RunRow,
  Snapshot,
  ToolInfo,
  TwinDiff,
  ValidationResult,
  VersionStatus,
  ModelProfile,
  Policy,
  Block,
} from '../types';

// ---------- Errors ----------
export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid_spec'
  | 'conflict'
  | 'rate_limited'
  | 'budget_exceeded'
  | 'internal';

// ---------- Request bodies (validated by routes) ----------
const yamlText = z.string().min(1).max(20_000);
export const CreateAgentBody = z.object({
  spec_yaml: yamlText,
  scenarios: z.record(z.string().regex(/^[a-z0-9-]+\.ya?ml$/), yamlText).refine((s) => Object.keys(s).length <= 20, {
    message: 'at most 20 scenarios',
  }),
  team: z.string().max(60).optional(),
  owner: z.string().max(60).optional(),
});
export type CreateAgentBody = z.infer<typeof CreateAgentBody>;

export const PutSpecBody = z.object({ spec_yaml: yamlText });
export type PutSpecBody = z.infer<typeof PutSpecBody>;

export const ChatBody = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(30),
});
export type ChatBody = z.infer<typeof ChatBody>;

export const DecisionBody = z.object({ decision: z.enum(['approve', 'reject']) });
export type DecisionBody = z.infer<typeof DecisionBody>;

export const GenerateTestsBody = z.object({ count: z.number().int().min(1).max(20).default(10) });
export type GenerateTestsBody = z.infer<typeof GenerateTestsBody>;

export const SimulateBody = z.object({ count: z.number().int().min(1).max(10).default(5) });
export type SimulateBody = z.infer<typeof SimulateBody>;

// ---------- Responses ----------
export interface HealthResponse { ok: true }

export interface TestPackSummary { name: string; description: string; templates: number }
export interface LibraryResponse {
  tools: ToolInfo[];
  profiles: Record<string, ModelProfile>;
  blocks: Block[];
  policies: Record<string, Policy>;
  packs: TestPackSummary[];
}

export interface AgentSummary {
  name: string;
  team: string | null;
  owner: string | null;
  goal: string | null;
  current_version: number | null;
  latest_version: number | null;
  latest_status: VersionStatus | 'draft';
  pass_rate: number | null;
  avg_cost_usd: number | null;
  runs_24h: number;
  updated_at: string;
}

export interface VersionSummary {
  version: number;
  status: VersionStatus;
  pass_rate: number | null;
  total_cost_usd: number | null;
  started_at: string;
  finished_at: string | null;
}

export interface AgentDetail {
  name: string;
  team: string | null;
  owner: string | null;
  current_version: number | null;
  draft_spec_yaml: string;
  draft_scenarios: Record<string, string>;
  validation: ValidationResult;
  versions: VersionSummary[];
}

export interface CreateAgentResponse { name: string; ok: boolean; errors: ValidationResult['errors'] }
export type ValidateResponse = ValidationResult;
export interface DeployResponse { version: number; status: 'running' }
export type GateResponse = GateResult;
export interface RollbackResponse { current_version: number }
export interface ChatResponse { run_id: string; reply: string; cost_usd: number }
/** Proposed scenarios (not yet saved): filename -> scenario YAML. The UI lets the user accept them into the draft. */
export interface GenerateTestsResponse { scenarios: Record<string, string> }
export interface ResetLiveResponse { ok: true; /** Agents created live (not seeded) that the reset deleted. */ purged_agents?: string[] }

export interface RunTrace {
  run: RunRow;
  events: RunEvent[];
  diff: TwinDiff | null;
  before_snapshot: Snapshot | null;
  after_snapshot: Snapshot | null;
}

export interface RunListItem {
  id: string;
  agent: string;
  version: number | null;
  mode: 'live' | 'scenario';
  scenario: string | null;
  started_at: string;
  cost_usd: number;
  outcome: string | null;
  preview: string | null;
}

export interface Approval {
  id: number;
  type: string;
  account_id: string | null;
  details: string | null;
  tool_args: unknown;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  decided_at: string | null;
}
export interface DecisionResponse { status: 'approved' | 'rejected' }

export interface AuditRow {
  id: number;
  ts: string;
  actor: string;
  action: string;
  target: string | null;
  detail: unknown;
  /** Enterprise: role of the actor at the time (authz rows), whether the attempt was allowed, and the team. */
  actor_role?: string | null;
  allowed?: boolean | null;
  team_id?: string | null;
}

export interface SimulateResponse { runs: number; cost_usd: number; policy_blocks: number; approvals: number }

// ---------- Route map (for reference and for typed clients) ----------
// GET  /api/health                              -> HealthResponse
// GET  /api/library                             -> LibraryResponse
// GET  /api/agents                              -> AgentSummary[]
// POST /api/agents            CreateAgentBody   -> CreateAgentResponse
// GET  /api/agents/:name                        -> AgentDetail
// PUT  /api/agents/:name/spec PutSpecBody       -> ValidateResponse
// POST /api/agents/:name/validate               -> ValidateResponse
// POST /api/agents/:name/deploy                 -> DeployResponse
// GET  /api/agents/:name/versions/:v            -> GateResponse
// POST /api/agents/:name/rollback               -> RollbackResponse
// POST /api/agents/:name/chat ChatBody          -> ChatResponse
// POST /api/agents/:name/generate-tests GenerateTestsBody -> GenerateTestsResponse
// GET  /api/runs?limit=50&agent=x               -> RunListItem[]
// GET  /api/runs/:id                            -> RunTrace
// GET  /api/approvals?status=pending            -> Approval[]
// POST /api/approvals/:id     DecisionBody      -> DecisionResponse
// GET  /api/audit                               -> AuditRow[]
// POST /api/admin/reset-live                    -> ResetLiveResponse
// POST /api/admin/simulate    SimulateBody      -> SimulateResponse
// ALL  /api/mcp/[transport]                     -> MCP Streamable HTTP
