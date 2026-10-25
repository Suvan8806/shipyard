// Stress test metadata (stored in the header row, see lib/platform/repo.ts "stress tests") + id helpers.
import type { StressMode, StressStatus } from '../contracts/stress';
import type { AgentSpec } from '../types';

export interface StressMeta {
  mode: StressMode;
  status: StressStatus;
  /** redteam: attacks are generated first, then run. */
  phase: 'generating' | 'testing';
  created_at: string;
  finished_at: string | null;
  total_cost_usd: number | null;
  headline: string;
  error?: string;
  /** The spec every attempt runs (the draft, or the live version's spec when the draft is invalid). */
  spec: AgentSpec;
  /** Agent version the spec came from; null for the draft. */
  source_version: number | null;
  /** Scenario names in the suite (redteam: the generated attacks, once generated). */
  scenario_names: string[];
  estimate_usd: number;
  runs?: number;
  profile?: string;
  count?: number;
  models?: string[];
  attacks?: { name: string; description: string }[];
}

/** Stress ids are "s<N>" for the negative scenario_results version -N. */
export const toStressId = (version: number) => `s${-version}`;

export function fromStressId(id: string): number | null {
  const m = /^s([1-9]\d{0,8})$/.exec(id);
  return m ? -Number(m[1]) : null;
}

export function asMeta(raw: Record<string, unknown>): StressMeta | null {
  if (!raw || typeof raw.mode !== 'string' || typeof raw.status !== 'string' || !raw.spec) return null;
  return raw as unknown as StressMeta;
}

/** The spec an attempt runs with: reliability may swap in the cheap profile. */
export function attemptSpec(meta: StressMeta): AgentSpec {
  return meta.mode === 'reliability' && meta.profile ? { ...meta.spec, profile: meta.profile } : meta.spec;
}

/** Matrix attempts are numbered per model: attempt k runs models[k-1]. */
export function attemptModel(meta: StressMeta, attempt: number): string | undefined {
  return meta.mode === 'matrix' ? meta.models?.[attempt - 1] : undefined;
}

export function workerPath(agent: string, stressId: string): string {
  return `/api/agents/${encodeURIComponent(agent)}/stress/${encodeURIComponent(stressId)}/run`;
}
