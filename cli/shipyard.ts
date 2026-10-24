#!/usr/bin/env -S npx tsx
// Shipyard CLI: thin HTTP client over the REST API (PRD 15).
// Usage: npx tsx cli/shipyard.ts <validate|deploy|chat|rollback|run|agents> [arg]
// Env: SHIPYARD_API_URL (default http://localhost:3000), SHIPYARD_ADMIN_TOKEN (optional bearer).
import { Command } from 'commander';
import readline from 'node:readline/promises';
import type {
  AgentSummary,
  ChatResponse,
  DeployResponse,
  GateResponse,
  RollbackResponse,
  RunTrace,
  ValidateResponse,
} from '../lib/contracts/api';
import type { ChatMessage } from '../lib/types';

// Minimal ANSI colors (no dependency). Disabled when NO_COLOR is set or stdout is not a TTY.
const useColor = !process.env.NO_COLOR && process.stdout.isTTY === true;
const ansi = (open: number, close: number) => (s: string) => (useColor ? `\x1b[${open}m${s}\x1b[${close}m` : s);
const pc = {
  bold: ansi(1, 22), dim: ansi(2, 22),
  red: ansi(31, 39), green: ansi(32, 39), yellow: ansi(33, 39), magenta: ansi(35, 39), cyan: ansi(36, 39),
  black: ansi(30, 39), white: ansi(37, 39), bgRed: ansi(41, 49), bgGreen: ansi(42, 49),
};

const BASE = (process.env.SHIPYARD_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-shipyard-actor': 'cli' };
  if (process.env.SHIPYARD_ADMIN_TOKEN) headers.authorization = `Bearer ${process.env.SHIPYARD_ADMIN_TOKEN}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string; details?: unknown } };
  if (!res.ok) {
    const e = data.error;
    console.error(pc.red(`${res.status} ${e?.code ?? 'error'}: ${e?.message ?? res.statusText}`));
    if (e?.details) console.error(pc.dim(JSON.stringify(e.details, null, 2)));
    process.exit(1);
  }
  return data as T;
}

function printErrors(v: ValidateResponse) {
  if (v.ok) console.log(pc.green('✔ valid'));
  else for (const e of v.errors) console.log(pc.red(`✘ ${e.path}: ${e.message}`));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const program = new Command().name('shipyard').description(`Shipyard CLI (${BASE})`);

program
  .command('agents')
  .description('list agents')
  .action(async () => {
    const rows = await api<AgentSummary[]>('GET', '/api/agents');
    for (const a of rows) {
      const status = a.latest_status === 'live' ? pc.green(a.latest_status) : a.latest_status === 'blocked' ? pc.red(a.latest_status) : pc.yellow(a.latest_status);
      console.log(`${a.name.padEnd(24)} v${a.current_version ?? '-'}  ${status.padEnd(18)} ${a.team ?? ''}`);
    }
  });

program
  .command('validate <name>')
  .description("validate an agent's draft")
  .action(async (name: string) => printErrors(await api<ValidateResponse>('POST', `/api/agents/${name}/validate`)));

program
  .command('deploy <name>')
  .description('deploy the draft and stream per-scenario results')
  .action(async (name: string) => {
    const d = await api<DeployResponse>('POST', `/api/agents/${name}/deploy`);
    console.log(pc.bold(`deploying ${name} v${d.version}…`));
    const seen = new Map<string, string>();
    const deadline = Date.now() + 300_000;
    for (;;) {
      const g = await api<GateResponse>('GET', `/api/agents/${name}/versions/${d.version}`);
      for (const r of g.results) {
        const key = `${r.scenario}#${r.attempt}`;
        if (r.status === 'running' || seen.get(key) === r.status) continue;
        seen.set(key, r.status);
        const mark = r.status === 'passed' ? pc.green('✔ PASS') : pc.red(`✘ ${r.status.toUpperCase()}`);
        console.log(`  ${mark} ${r.scenario}`);
        for (const a of r.assertions.filter((x) => !x.passed)) {
          console.log(pc.dim(`      ${a.critical ? 'critical ' : ''}expected ${a.expected}, got ${a.actual}`));
        }
      }
      if (g.status !== 'running' || Date.now() > deadline) {
        const rate = g.pass_rate === null ? '-' : `${Math.round(g.pass_rate * 100)}%`;
        const banner = g.status === 'live' ? pc.bgGreen(pc.black(' LIVE ')) : g.status === 'blocked' ? pc.bgRed(pc.white(' BLOCKED ')) : pc.yellow(g.status);
        console.log(`\n${banner} v${g.version}  pass rate ${rate}  cost $${(g.total_cost_usd ?? 0).toFixed(4)}`);
        if (g.status === 'blocked') console.log(pc.dim(`v${g.current_version ?? '-'} is still serving.`));
        console.log(pc.dim(`${BASE}/agents/${name}/versions/${g.version}`));
        process.exit(g.status === 'live' ? 0 : 2);
      }
      await sleep(1500);
    }
  });

program
  .command('chat <name>')
  .description('chat with the live version (Ctrl+C to quit)')
  .action(async (name: string) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const messages: ChatMessage[] = [];
    for (;;) {
      const line = (await rl.question(pc.cyan('you> '))).trim();
      if (!line) continue;
      messages.push({ role: 'user', content: line });
      const r = await api<ChatResponse>('POST', `/api/agents/${name}/chat`, { messages: messages.slice(-30) });
      messages.push({ role: 'assistant', content: r.reply });
      console.log(`${pc.magenta(`${name}>`)} ${r.reply}\n${pc.dim(`run ${r.run_id} · $${r.cost_usd.toFixed(4)}`)}`);
    }
  });

program
  .command('rollback <name>')
  .description('roll back to the previous live version')
  .action(async (name: string) => {
    const r = await api<RollbackResponse>('POST', `/api/agents/${name}/rollback`);
    console.log(pc.green(`${name} now serving v${r.current_version}`));
  });

program
  .command('run <id>')
  .description('print a run trace')
  .action(async (id: string) => {
    const t = await api<RunTrace>('GET', `/api/runs/${id}`);
    console.log(pc.bold(`${t.run.agent} v${t.run.version ?? '-'} · ${t.run.mode}${t.run.scenario ? ` · ${t.run.scenario}` : ''} · $${t.run.cost_usd.toFixed(4)}`));
    for (const e of t.events) {
      const color = e.type === 'policy_block' || e.type === 'error' ? pc.red : e.type === 'tool_call' ? pc.cyan : pc.dim;
      console.log(color(`  #${e.seq} ${e.type}${e.name ? ` ${e.name}` : ''}${e.latency_ms ? ` ${e.latency_ms}ms` : ''}`));
    }
    if (t.run.final_reply) console.log(`\n${t.run.final_reply}`);
    if (t.diff) console.log(pc.yellow(`\ntwin diff: ${JSON.stringify(t.diff)}`));
  });

program.parseAsync().catch((e) => {
  console.error(pc.red(e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
