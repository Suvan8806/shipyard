// Demo replay cache (PRD 12): keyed by agent_versions.spec_hash. With SHIPYARD_DEMO_REPLAY=1, a deploy whose
// hash matches a finished version copies its results one by one with staggered delays instead of calling the LLM.
// A per-request override (?replay=1 on the deploy route) turns it on for one deploy without touching env vars.
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';

const replayOverride = new AsyncLocalStorage<boolean>();

/** sha256 over the spec YAML and the scenario files (sorted by filename). */
export function specHash(specYaml: string, scenarios: Record<string, string> = {}): string {
  const sorted = Object.keys(scenarios)
    .sort()
    .map((k) => [k, scenarios[k]]);
  return createHash('sha256').update(JSON.stringify({ spec: specYaml, scenarios: sorted })).digest('hex');
}

export function replayEnabled(): boolean {
  return replayOverride.getStore() === true || process.env.SHIPYARD_DEMO_REPLAY === '1';
}

/** Runs fn with demo replay forced on (when `on`) for everything it awaits, regardless of SHIPYARD_DEMO_REPLAY. */
export function withReplay<T>(on: boolean, fn: () => Promise<T>): Promise<T> {
  return on ? replayOverride.run(true, fn) : fn();
}

/** True when a request asks for replay: `?replay=1` (or true) or header `x-shipyard-replay: 1`. */
export function replayRequested(req: Request): boolean {
  const truthy = (v: string | null) => v === '1' || v === 'true';
  try {
    if (truthy(new URL(req.url).searchParams.get('replay'))) return true;
  } catch {
    /* relative or malformed URL: fall through to the header */
  }
  return truthy(req.headers.get('x-shipyard-replay'));
}

/** 400-900 ms, so the board still animates. Tests set SHIPYARD_REPLAY_DELAY_MS=0. */
export function replayDelayMs(): number {
  const fixed = process.env.SHIPYARD_REPLAY_DELAY_MS;
  if (fixed !== undefined) return Math.max(0, Number(fixed) || 0);
  return 400 + Math.floor(Math.random() * 500);
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
