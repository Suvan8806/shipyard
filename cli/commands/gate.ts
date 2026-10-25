// deploy + results: the live terminal gate board.
import fs from 'node:fs';
import type { DeployResponse, GateResponse, ValidateResponse } from '../../lib/contracts/api';
import type { GateResult } from '../../lib/types';
import { buildTags, changeLine, renderBoard, renderFailures, renderVerdict, type TagStatus } from '../lib/board';
import { type Ctx, CliExit, EXIT, sleep } from '../lib/context';
import { enc } from '../lib/http';
import { renderValidation } from '../lib/render';
import { gateSummaryMarkdown } from '../lib/summary';

const MAX_CONSECUTIVE_POLL_ERRORS = 5;
const FRAME_MS = 200;

export interface DeployOpts {
  file?: string;
  watch?: boolean;
  ci?: boolean;
  timeout?: string;
  summary?: string;
}

export function readSpecFile(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw new CliExit(EXIT.error, `cannot read ${file}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function pushSpec(ctx: Ctx, name: string, file: string): Promise<ValidateResponse> {
  const v = await ctx.client.put<ValidateResponse>(`/api/agents/${enc(name)}/spec`, { spec_yaml: readSpecFile(file) });
  if (!ctx.json) ctx.io.out(renderValidation(v, ctx.st, `${name} draft (pushed ${file})`));
  return v;
}

export function gateExitCode(g: GateResult): number {
  return g.status === 'live' ? EXIT.ok : g.status === 'blocked' ? EXIT.blocked : EXIT.error;
}

/** Final report printed after a gate finishes (or for `results`). */
export function printGateReport(ctx: Ctx, g: GateResult, withBoard: boolean): void {
  const width = ctx.io.columns;
  const lines: string[] = [];
  if (withBoard) lines.push(...renderBoard(g, ctx.st, { width }), '');
  lines.push(...renderVerdict(g, ctx.st));
  const failures = renderFailures(g, ctx.st, { width });
  if (failures.length) lines.push('', ...failures);
  lines.push('', ctx.st.dim(`${ctx.client.baseUrl}/agents/${g.agent}/versions/${g.version}`));
  ctx.io.out(lines.join('\n'));
}

export async function watchGate(ctx: Ctx, name: string, version: number, timeoutMs: number): Promise<GateResult> {
  const { io, st } = ctx;
  const started = Date.now();
  const live = io.isTTY && !ctx.json;
  const seen = new Map<string, TagStatus>();
  let last: GateResult | null = null;
  let drawn = 0;
  let frame = 0;
  let lastFetch = 0;
  let errors = 0;

  const draw = (g: GateResult) => {
    const lines = renderBoard(g, st, { width: io.columns, frame, elapsedMs: Date.now() - started });
    io.write(`${drawn ? `\x1b[${drawn}F\x1b[J` : ''}${lines.join('\n')}\n`);
    drawn = lines.length;
  };
  if (live) io.write('\x1b[?25l');
  try {
    for (;;) {
      if (Date.now() - lastFetch >= ctx.pollMs) {
        lastFetch = Date.now();
        try {
          last = await ctx.client.get<GateResponse>(`/api/agents/${enc(name)}/versions/${version}`);
          errors = 0;
        } catch (e) {
          errors += 1;
          if (errors >= MAX_CONSECUTIVE_POLL_ERRORS) throw e;
        }
        if (last && !live && !ctx.json) {
          for (const t of buildTags(last)) {
            if (t.status === 'running' || t.status === 'pending' || seen.get(t.scenario) === t.status) continue;
            seen.set(t.scenario, t.status);
            io.out(changeLine(t, st));
          }
        }
      }
      if (last && live) draw(last);
      if (last && last.status !== 'running') return last;
      if (Date.now() - started > timeoutMs) {
        throw new CliExit(EXIT.error, `timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${name} v${version} (still ${last?.status ?? 'unknown'})`);
      }
      frame += 1;
      await sleep(live ? Math.min(FRAME_MS, ctx.pollMs) : ctx.pollMs);
    }
  } finally {
    if (live) io.write('\x1b[?25h');
  }
}

function writeSummary(ctx: Ctx, g: GateResult, file: string | undefined): void {
  const target = file ?? process.env.GITHUB_STEP_SUMMARY;
  if (!target) return;
  try {
    fs.appendFileSync(target, `${gateSummaryMarkdown(g, ctx.client.baseUrl)}\n`);
  } catch (e) {
    ctx.io.err(ctx.st.yellow(`could not write job summary to ${target}: ${e instanceof Error ? e.message : String(e)}`));
  }
}

export async function deployCommand(ctx: Ctx, name: string, opts: DeployOpts): Promise<number> {
  if (opts.file) {
    const v = await pushSpec(ctx, name, opts.file);
    if (!v.ok) {
      if (ctx.json) ctx.io.out(JSON.stringify({ pushed: v }, null, 2));
      throw new CliExit(opts.ci ? EXIT.error : EXIT.blocked, 'spec is invalid; not deploying');
    }
  }
  const d = await ctx.client.post<DeployResponse>(`/api/agents/${enc(name)}/deploy`);
  const watch = opts.watch || opts.ci;
  if (!watch) {
    if (ctx.json) ctx.io.out(JSON.stringify(d, null, 2));
    else {
      ctx.io.out(`${ctx.st.bold(`${name} v${d.version}`)} is gating. Watch it with: ${ctx.st.cyan(`shipyard results ${name} ${d.version}`)} or re-run with --watch`);
      ctx.io.out(ctx.st.dim(`${ctx.client.baseUrl}/agents/${name}/versions/${d.version}`));
    }
    return EXIT.ok;
  }
  if (!ctx.json) ctx.io.out(ctx.st.dim(`deploying ${name} v${d.version} · every test runs on its own throwaway twin database…\n`));
  const timeoutMs = Math.max(30, Number(opts.timeout ?? 600)) * 1000;
  const g = await watchGate(ctx, name, d.version, timeoutMs);
  if (opts.ci || opts.summary) writeSummary(ctx, g, opts.summary);
  if (ctx.json) ctx.io.out(JSON.stringify(g, null, 2));
  else {
    ctx.io.out('');
    printGateReport(ctx, g, !ctx.io.isTTY);
  }
  return gateExitCode(g);
}

export async function resultsCommand(ctx: Ctx, name: string, version: string, opts: { ci?: boolean; summary?: string }): Promise<number> {
  const v = Number.parseInt(version.replace(/^v/, ''), 10);
  if (!Number.isFinite(v)) throw new CliExit(EXIT.error, `version must be a number, got "${version}"`);
  const g = await ctx.client.get<GateResponse>(`/api/agents/${enc(name)}/versions/${v}`);
  if (opts.summary) writeSummary(ctx, g, opts.summary);
  if (ctx.json) ctx.io.out(JSON.stringify(g, null, 2));
  else printGateReport(ctx, g, true);
  return opts.ci ? gateExitCode(g) : EXIT.ok;
}
