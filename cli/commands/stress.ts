// stress + diff: the stress lab (reliability / red team / model matrix) and version diffs (STRESS CONTRACT).
import type { AgentDetail, GateResponse } from '../../lib/contracts/api';
import { type Ctx, CliExit, EXIT, sleep } from '../lib/context';
import { ApiCallError, enc } from '../lib/http';
import { renderStress, renderStressList, renderVersionDiff } from '../lib/render';
import { money } from '../lib/ansi';
import {
  type StressMode,
  type StressRequest,
  type StressResult,
  type StressStartResponse,
  type StressSummary,
  type VersionDiff,
  estimateStressCost,
} from '../lib/stress-types';

const MODES: StressMode[] = ['reliability', 'redteam', 'matrix'];
const NOT_DEPLOYED = 'stress lab not deployed on this server (it ships with the dev-stress branch). Try a preview URL with --api.';

export interface StressOpts {
  mode?: string;
  runs?: string;
  count?: string;
  models?: string;
  list?: boolean;
  id?: string;
  watch?: boolean;
  ci?: boolean;
  timeout?: string;
}

function notDeployed(e: unknown): boolean {
  return e instanceof ApiCallError && e.code === 'route_not_found';
}

function int(v: string | undefined, label: string): number | undefined {
  if (v === undefined) return undefined;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) throw new CliExit(EXIT.error, `${label} must be a number, got "${v}"`);
  return n;
}

export function buildStressRequest(opts: StressOpts): StressRequest {
  const mode = opts.mode as StressMode;
  if (!MODES.includes(mode)) throw new CliExit(EXIT.error, `--mode must be one of ${MODES.join(', ')}`);
  const req: StressRequest = { mode };
  if (mode === 'reliability') {
    const runs = int(opts.runs, '--runs');
    if (runs !== undefined && (runs < 2 || runs > 5)) throw new CliExit(EXIT.error, '--runs must be 2-5');
    if (runs !== undefined) req.runs = runs;
  } else if (mode === 'redteam') {
    const count = int(opts.count, '--count');
    if (count !== undefined && (count < 10 || count > 60)) throw new CliExit(EXIT.error, '--count must be 10-60');
    if (count !== undefined) req.count = count;
  } else if (opts.models) {
    const models = opts.models.split(',').map((m) => m.trim()).filter(Boolean);
    if (models.length < 2 || models.length > 4) throw new CliExit(EXIT.error, '--models needs 2-4 comma-separated model strings');
    req.models = models;
  }
  return req;
}

/** Test count for the cost estimate: the latest gated version's scenario list (best effort). */
async function testCount(ctx: Ctx, name: string): Promise<number | null> {
  try {
    const a = await ctx.client.get<AgentDetail>(`/api/agents/${enc(name)}`);
    const v = a.current_version ?? a.versions[0]?.version;
    if (!v) return null;
    const g = await ctx.client.get<GateResponse>(`/api/agents/${enc(name)}/versions/${v}`);
    return g.scenario_names.length || null;
  } catch {
    return null;
  }
}

function stressExitCode(r: StressResult, ci: boolean | undefined): number {
  if (r.status === 'error') return EXIT.error;
  if (!ci) return EXIT.ok;
  if (r.redteam && r.redteam.broke_through > 0) return EXIT.blocked;
  if (r.reliability && r.reliability.scenarios.some((s) => s.flaky || s.passes < s.runs)) return EXIT.blocked;
  if (r.matrix && r.matrix.models.every((m) => (m.pass_rate ?? 0) < 1)) return EXIT.blocked;
  return EXIT.ok;
}

async function watchStress(ctx: Ctx, name: string, id: string, timeoutMs: number): Promise<StressResult> {
  const { io, st } = ctx;
  const live = io.isTTY && !ctx.json;
  const started = Date.now();
  let drawn = 0;
  for (;;) {
    const r = await ctx.client.get<StressResult>(`/api/agents/${enc(name)}/stress/${enc(id)}`);
    if (live) {
      const text = renderStress(r, st, io.columns);
      io.write(`${drawn ? `\x1b[${drawn}F\x1b[J` : ''}${text}\n`);
      drawn = text.split('\n').length;
    }
    if (r.status !== 'running') return r;
    if (Date.now() - started > timeoutMs) throw new CliExit(EXIT.error, `timed out waiting for stress run ${id}; check later with: shipyard stress ${name} --id ${id}`);
    await sleep(Math.max(ctx.pollMs, 1000));
  }
}

export async function stressCommand(ctx: Ctx, name: string, opts: StressOpts): Promise<number> {
  const base = `/api/agents/${enc(name)}/stress`;
  try {
    if (opts.list) {
      const rows = await ctx.client.get<StressSummary[]>(base);
      ctx.io.out(ctx.json ? JSON.stringify(rows, null, 2) : renderStressList(rows, ctx.st));
      return EXIT.ok;
    }
    if (opts.id) {
      const r = await ctx.client.get<StressResult>(`${base}/${enc(opts.id)}`);
      ctx.io.out(ctx.json ? JSON.stringify(r, null, 2) : renderStress(r, ctx.st, ctx.io.columns));
      return stressExitCode(r, opts.ci);
    }
    if (!opts.mode) throw new CliExit(EXIT.error, 'pass --mode reliability|redteam|matrix (or --list / --id <stress_id>)');
    const req = buildStressRequest(opts);
    const tests = await testCount(ctx, name);
    if (!ctx.json) {
      const est = estimateStressCost(req, tests ?? 46);
      ctx.io.out(ctx.st.dim(`estimate: ${est.runs} scenario runs ≈ ${money(est.usd, 2)}${tests ? '' : ' (assuming ~46 tests)'} · the server re-checks this against the remaining budget`));
    }
    const start = await ctx.client.post<StressStartResponse>(base, req);
    if (opts.watch === false) {
      ctx.io.out(ctx.json ? JSON.stringify(start, null, 2) : `stress ${req.mode} started: ${ctx.st.bold(start.stress_id)}  (shipyard stress ${name} --id ${start.stress_id})`);
      return EXIT.ok;
    }
    const r = await watchStress(ctx, name, start.stress_id, Math.max(30, Number(opts.timeout ?? 900)) * 1000);
    if (ctx.json) ctx.io.out(JSON.stringify(r, null, 2));
    else if (!ctx.io.isTTY) ctx.io.out(renderStress(r, ctx.st, ctx.io.columns));
    return stressExitCode(r, opts.ci);
  } catch (e) {
    if (notDeployed(e)) throw new CliExit(EXIT.error, NOT_DEPLOYED);
    if (e instanceof ApiCallError && e.status === 402) {
      const d = (e.details ?? {}) as Record<string, number>;
      const extra = d.estimate_usd !== undefined ? ` (estimate ${money(d.estimate_usd, 2)}, remaining ${money(d.remaining_usd ?? null, 2)})` : '';
      throw new CliExit(EXIT.error, `budget exceeded: ${e.message}${extra}. Lower --runs/--count or check: shipyard budget`);
    }
    throw e;
  }
}

export async function diffCommand(ctx: Ctx, name: string, from: string, to: string): Promise<number> {
  const f = Number.parseInt(from.replace(/^v/, ''), 10);
  const t = Number.parseInt(to.replace(/^v/, ''), 10);
  if (!Number.isFinite(f) || !Number.isFinite(t)) throw new CliExit(EXIT.error, 'diff needs two version numbers, e.g. shipyard diff support-agent 3 4');
  try {
    const d = await ctx.client.get<VersionDiff>(`/api/agents/${enc(name)}/diff?from=${f}&to=${t}`);
    ctx.io.out(ctx.json ? JSON.stringify(d, null, 2) : renderVersionDiff(d, ctx.st));
    return EXIT.ok;
  } catch (e) {
    if (notDeployed(e)) throw new CliExit(EXIT.error, 'version diff is not deployed on this server yet (it ships with the stress lab). Try a preview URL with --api.');
    throw e;
  }
}
