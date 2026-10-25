// agents, validate, push, trace, budget, rollback, chat.
import fs from 'node:fs';
import readline from 'node:readline/promises';
import type {
  AgentSummary,
  ChatResponse,
  LibraryResponse,
  RollbackResponse,
  RunTrace,
  ValidateResponse,
} from '../../lib/contracts/api';
import type { ChatMessage } from '../../lib/types';
import { type Ctx, CliExit, EXIT } from '../lib/context';
import { enc } from '../lib/http';
import { readScenarioDir, validateLocal } from '../lib/local-validate';
import { renderAgents, renderBudget, renderTrace, renderValidation } from '../lib/render';
import { pushSpec, readSpecFile } from './gate';

const emit = (ctx: Ctx, data: unknown, text: () => string) => ctx.io.out(ctx.json ? JSON.stringify(data, null, 2) : text());

export async function agentsCommand(ctx: Ctx): Promise<number> {
  const rows = await ctx.client.get<AgentSummary[]>('/api/agents');
  emit(ctx, rows, () => renderAgents(rows, ctx.st));
  return EXIT.ok;
}

export async function validateCommand(ctx: Ctx, name: string, opts: { file?: string; scenariosDir?: string }): Promise<number> {
  if (!opts.file) {
    const v = await ctx.client.post<ValidateResponse>(`/api/agents/${enc(name)}/validate`);
    emit(ctx, v, () => renderValidation(v, ctx.st, `${name} draft (server)`));
    return v.ok ? EXIT.ok : EXIT.blocked;
  }
  const spec = readSpecFile(opts.file);
  let scenarios: Record<string, string> | null = null;
  if (opts.scenariosDir) {
    if (!fs.existsSync(opts.scenariosDir)) throw new CliExit(EXIT.error, `scenarios dir not found: ${opts.scenariosDir}`);
    scenarios = readScenarioDir(opts.scenariosDir);
  }
  // Library refs come from the server; if it is unreachable we still run the offline schema checks.
  let library: LibraryResponse | null = null;
  try {
    library = await ctx.client.get<LibraryResponse>('/api/library');
  } catch {
    if (!ctx.json) ctx.io.err(ctx.st.yellow('library unreachable: skipping tool/profile/block/pack checks'));
  }
  const v = validateLocal(spec, scenarios, library, name);
  const label = `${opts.file}${scenarios ? ` + ${Object.keys(scenarios).length} scenarios` : ''} (local, server draft untouched)`;
  emit(ctx, v, () => renderValidation(v, ctx.st, label));
  return v.ok ? EXIT.ok : EXIT.blocked;
}

export async function pushCommand(ctx: Ctx, name: string, opts: { file: string }): Promise<number> {
  const v = await pushSpec(ctx, name, opts.file);
  if (ctx.json) ctx.io.out(JSON.stringify(v, null, 2));
  return v.ok ? EXIT.ok : EXIT.blocked;
}

export async function traceCommand(ctx: Ctx, runId: string): Promise<number> {
  const t = await ctx.client.get<RunTrace>(`/api/runs/${enc(runId)}`);
  emit(ctx, t, () => `${renderTrace(t, ctx.st, ctx.io.columns)}\n\n${ctx.st.dim(`${ctx.client.baseUrl}/runs/${runId}`)}`);
  return EXIT.ok;
}

export async function budgetCommand(ctx: Ctx): Promise<number> {
  const h = await ctx.client.get<{ ok: boolean; spend_usd: number | null; budget_usd?: number }>('/api/health');
  const data = { spend_usd: h.spend_usd ?? null, budget_usd: h.budget_usd ?? 0 };
  emit(ctx, { ok: h.ok, ...data, remaining_usd: data.budget_usd - (data.spend_usd ?? 0) }, () => renderBudget(data, ctx.st, ctx.client.baseUrl));
  return EXIT.ok;
}

export async function rollbackCommand(ctx: Ctx, name: string): Promise<number> {
  const r = await ctx.client.post<RollbackResponse>(`/api/agents/${enc(name)}/rollback`);
  emit(ctx, r, () => ctx.st.green(`${name} now serving v${r.current_version}`));
  return EXIT.ok;
}

export async function chatCommand(ctx: Ctx, name: string, opts: { message?: string }): Promise<number> {
  if (opts.message) {
    const r = await ctx.client.post<ChatResponse>(`/api/agents/${enc(name)}/chat`, { messages: [{ role: 'user', content: opts.message }] });
    emit(ctx, r, () => `${ctx.st.magenta(`${name}>`)} ${r.reply}\n${ctx.st.dim(`run ${r.run_id} · $${r.cost_usd.toFixed(4)} · shipyard trace ${r.run_id}`)}`);
    return EXIT.ok;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const messages: ChatMessage[] = [];
  try {
    for (;;) {
      const line = (await rl.question(ctx.st.cyan('you> '))).trim();
      if (!line) continue;
      if (line === '/quit' || line === '/exit') return EXIT.ok;
      messages.push({ role: 'user', content: line });
      const r = await ctx.client.post<ChatResponse>(`/api/agents/${enc(name)}/chat`, { messages: messages.slice(-30) });
      messages.push({ role: 'assistant', content: r.reply });
      ctx.io.out(`${ctx.st.magenta(`${name}>`)} ${r.reply}\n${ctx.st.dim(`run ${r.run_id} · $${r.cost_usd.toFixed(4)}`)}`);
    }
  } finally {
    rl.close();
  }
}
