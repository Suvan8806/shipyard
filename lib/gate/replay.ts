// Demo replay cache (PRD 12): keyed by agent_versions.spec_hash. With SHIPYARD_DEMO_REPLAY=1, a deploy whose
// hash matches a finished version copies its results one by one with staggered delays instead of calling the LLM.
import { createHash } from 'node:crypto';

/** sha256 over the spec YAML and the scenario files (sorted by filename). */
export function specHash(specYaml: string, scenarios: Record<string, string> = {}): string {
  const sorted = Object.keys(scenarios)
    .sort()
    .map((k) => [k, scenarios[k]]);
  return createHash('sha256').update(JSON.stringify({ spec: specYaml, scenarios: sorted })).digest('hex');
}

export function replayEnabled(): boolean {
  return process.env.SHIPYARD_DEMO_REPLAY === '1';
}

/** 400-900 ms, so the board still animates. Tests set SHIPYARD_REPLAY_DELAY_MS=0. */
export function replayDelayMs(): number {
  const fixed = process.env.SHIPYARD_REPLAY_DELAY_MS;
  if (fixed !== undefined) return Math.max(0, Number(fixed) || 0);
  return 400 + Math.floor(Math.random() * 500);
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
