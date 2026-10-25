// Text renderers for the read-only CLI views: agents, validation, trace + twin diff, version diff, stress, budget.
import type { AgentSummary, RunTrace } from '../../lib/contracts/api';
import type { Row, TableDiff, ValidationResult } from '../../lib/types';
import { type Style, bar, money, oneLine, padEnd, pct, table, truncate } from './ansi';
import type { StressResult, StressSummary, VersionDiff } from './stress-types';

export function renderAgents(rows: AgentSummary[], st: Style): string {
  if (rows.length === 0) return st.dim('No agents yet.');
  const statusCell = (s: string) => (s === 'live' ? st.green(s) : s === 'blocked' ? st.red(s) : s === 'running' ? st.yellow(s) : st.dim(s));
  return table(
    ['AGENT', 'SERVING', 'LATEST', 'STATUS', 'PASS', 'AVG COST', 'RUNS 24H', 'TEAM'],
    rows.map((a) => [
      st.bold(a.name),
      a.current_version ? `v${a.current_version}` : '-',
      a.latest_version ? `v${a.latest_version}` : '-',
      statusCell(a.latest_status),
      pct(a.pass_rate),
      money(a.avg_cost_usd),
      String(a.runs_24h),
      st.dim(a.team ?? ''),
    ]),
    st,
    [4, 5, 6],
  );
}

export function renderValidation(v: ValidationResult, st: Style, label = 'spec'): string {
  if (v.ok) return st.green(`✔ ${label} is valid`);
  return [st.red(`✘ ${v.errors.length} problem${v.errors.length === 1 ? '' : 's'} in ${label}`), ...v.errors.map((e) => `  ${st.red('✘')} ${st.bold(e.path)}: ${e.message}`)].join('\n');
}

// ---------- trace ----------

function compact(v: unknown, max: number): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return truncate(oneLine(s ?? ''), max);
}

function rowLabel(r: Row): string {
  const id = r.id ?? r.account_id ?? '';
  const rest = Object.entries(r)
    .filter(([k]) => k !== 'id' && k !== 'created_at' && k !== 'updated_at')
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ');
  return `${id !== '' ? `#${String(id)} ` : ''}${rest}`;
}

export function renderTwinDiff(diff: Partial<Record<string, TableDiff>> | null, st: Style, width: number): string[] {
  const tables = Object.entries(diff ?? {}).filter(([, d]) => d && (d.added.length || d.removed.length || d.changed.length));
  if (tables.length === 0) return [st.dim('twin diff: no data changed')];
  const lines = [st.bold('Twin diff (what the agent actually changed)')];
  for (const [name, d] of tables) {
    if (!d) continue;
    lines.push(`  ${st.cyan(name)}`);
    for (const r of d.added) lines.push(`    ${st.green('+')} ${st.green(truncate(rowLabel(r), width - 8))}`);
    for (const r of d.removed) lines.push(`    ${st.red('-')} ${st.red(truncate(rowLabel(r), width - 8))}`);
    for (const ch of d.changed) {
      const cols = ch.columns.map((c) => `${c}: ${compact(ch.before[c], 30)} → ${st.bold(compact(ch.after[c], 30))}`).join(', ');
      lines.push(`    ${st.yellow('~')} ${truncate(`#${String(ch.after.id ?? ch.before.id ?? '?')} ${cols}`, width - 6)}`);
    }
  }
  return lines;
}

export function renderTrace(t: RunTrace, st: Style, width: number): string {
  const r = t.run;
  const start = Date.parse(r.started_at);
  const lines: string[] = [];
  lines.push(
    `${st.bold(`${r.agent} v${r.version ?? '-'}`)} · ${r.mode}${r.scenario ? ` · ${st.cyan(r.scenario)}` : ''} · ${money(r.cost_usd)} · ${r.tokens_in}→${r.tokens_out} tok · ${r.outcome === 'ok' ? st.green('ok') : st.red(r.outcome ?? '?')}`,
  );
  lines.push(st.dim(`run ${r.id} · ${r.started_at}`));
  lines.push('');
  lines.push(st.bold('Timeline'));
  for (const e of t.events) {
    const at = Number.isFinite(start) ? `+${((Date.parse(e.ts) - start) / 1000).toFixed(1)}s` : '';
    const head = `  ${st.dim(padEnd(at, 7))} ${st.dim(`#${e.seq}`)} `;
    const p = (e.payload ?? {}) as Record<string, unknown>;
    if (e.type === 'model_call') {
      const calls = Array.isArray(p.tool_calls) && p.tool_calls.length ? ` → ${st.cyan((p.tool_calls as string[]).join(', '))}` : '';
      const meta = st.dim(` ${e.latency_ms ?? '-'}ms ${e.tokens_in ?? 0}→${e.tokens_out ?? 0} tok ${money(e.cost_usd)}`);
      lines.push(`${head}${st.blue('model')} ${e.name ?? ''}${calls}${meta}`);
      if (typeof p.text === 'string' && p.text) lines.push(`             ${st.dim(`"${truncate(oneLine(p.text), width - 16)}"`)}`);
    } else if (e.type === 'tool_call') {
      lines.push(`${head}${st.cyan('tool ')} ${st.bold(e.name ?? '')}(${compact(p.args, Math.max(20, width - 40))})`);
      if (p.result !== undefined) lines.push(`             ${st.dim(`← ${compact(p.result, width - 18)}`)}`);
    } else if (e.type === 'policy_block') {
      lines.push(`${head}${st.red('BLOCK')} ${st.bold(e.name ?? '')} ${st.red(compact(p.reason ?? p, width - 30))}`);
    } else if (e.type === 'approval') {
      lines.push(`${head}${st.yellow('appr ')} ${e.name ?? ''} ${st.dim(compact(p, width - 30))}`);
    } else {
      lines.push(`${head}${st.magenta('error')} ${compact(p.message ?? p, width - 20)}`);
    }
  }
  if (r.final_reply) {
    lines.push('');
    lines.push(st.bold('Final reply'));
    lines.push(`  ${r.final_reply.split('\n').join('\n  ')}`);
  }
  lines.push('');
  lines.push(...renderTwinDiff(t.diff as Partial<Record<string, TableDiff>> | null, st, width));
  return lines.join('\n');
}

// ---------- version diff ----------

const CHANGE_ORDER = ['newly_failing', 'fixed', 'still_failing', 'added', 'removed', 'still_passing'] as const;

export function renderVersionDiff(d: VersionDiff, st: Style, context = 2): string {
  const lines: string[] = [st.bold(`v${d.from} → v${d.to}`), '', st.bold('Spec')];
  const changed = d.spec_diff.map((l) => l.kind !== 'same');
  if (!changed.some(Boolean)) lines.push(st.dim('  (spec unchanged)'));
  let lastShown = -1;
  d.spec_diff.forEach((l, i) => {
    const near = changed.slice(Math.max(0, i - context), i + context + 1).some(Boolean);
    if (!near) return;
    if (lastShown !== -1 && i > lastShown + 1) lines.push(st.dim('  …'));
    lastShown = i;
    const num = st.dim(String(l.line).padStart(4));
    if (l.kind === 'add') lines.push(`${num} ${st.green(`+ ${l.text}`)}`);
    else if (l.kind === 'del') lines.push(`${num} ${st.red(`- ${l.text}`)}`);
    else lines.push(`${num}   ${st.dim(l.text)}`);
  });
  lines.push('', st.bold('Tests'));
  const label: Record<string, string> = {
    newly_failing: st.red('newly failing'),
    fixed: st.green('fixed'),
    still_failing: st.yellow('still failing'),
    added: st.cyan('added'),
    removed: st.dim('removed'),
    still_passing: st.dim('still passing'),
  };
  for (const kind of CHANGE_ORDER) {
    const rows = d.scenarios.filter((s) => s.change === kind);
    if (rows.length === 0) continue;
    if (kind === 'still_passing') {
      lines.push(`  ${label[kind]} ${st.dim(`(${rows.length})`)}`);
      continue;
    }
    lines.push(`  ${label[kind]} ${st.dim(`(${rows.length})`)}`);
    for (const s of rows) lines.push(`    ${s.scenario} ${st.dim(`${s.from_status ?? '-'} → ${s.to_status ?? '-'}`)}`);
  }
  return lines.join('\n');
}

// ---------- stress ----------

export function renderStressList(rows: StressSummary[], st: Style): string {
  if (rows.length === 0) return st.dim('No stress runs yet.');
  return table(
    ['ID', 'MODE', 'STATUS', 'CREATED', 'HEADLINE'],
    rows.map((r) => [st.dim(r.stress_id), r.mode, r.status === 'done' ? st.green(r.status) : r.status === 'error' ? st.red(r.status) : st.yellow(r.status), st.dim(r.created_at.slice(0, 16).replace('T', ' ')), r.headline]),
    st,
  );
}

export function renderStress(r: StressResult, st: Style, width: number): string {
  const lines: string[] = [];
  const status = r.status === 'running' ? st.yellow('running') : r.status === 'done' ? st.green('done') : st.red('error');
  lines.push(`${st.bold(`${r.agent} · stress ${r.mode}`)}  ${status}  ${st.dim(money(r.total_cost_usd, 3))}`);
  lines.push(st.bold(r.headline));
  if (r.reliability) {
    const rel = r.reliability;
    lines.push(st.dim(`${rel.runs} runs per test · reliability ${rel.reliability_pct === null ? '-' : `${rel.reliability_pct.toFixed(1)}%`}`));
    const sorted = [...rel.scenarios].sort((a, b) => Number(b.flaky) - Number(a.flaky) || a.passes / Math.max(1, a.runs) - b.passes / Math.max(1, b.runs));
    lines.push(
      table(
        ['TEST', 'PASSES', '', ''],
        sorted.map((s) => {
          const frac = s.runs ? s.passes / s.runs : 0;
          const color = frac === 1 ? st.green : frac === 0 ? st.red : st.yellow;
          return [truncate(s.scenario, 40), `${s.passes}/${s.runs}`, bar(frac, 12, st, color), s.flaky ? st.yellow('FLAKY') : frac === 0 ? st.red('BROKEN') : ''];
        }),
        st,
        [1],
      ),
    );
  }
  if (r.redteam) {
    const rt = r.redteam;
    lines.push(st.dim(`${rt.generated} attacks generated · ${rt.broke_through} broke through`));
    const order = { failed: 0, error: 1, running: 2, passed: 3 } as const;
    for (const a of [...rt.attacks].sort((x, y) => order[x.status] - order[y.status])) {
      const g = a.status === 'failed' ? st.red('✘ BROKE THROUGH') : a.status === 'passed' ? st.green('✔ held') : a.status === 'error' ? st.magenta('! error') : st.yellow('◌ running');
      lines.push(`  ${padEnd(g, 16)} ${st.bold(truncate(a.scenario, 36))} ${st.dim(truncate(oneLine(a.description), Math.max(10, width - 58)))}`);
      for (const f of a.failed_assertions.slice(0, 3)) lines.push(`                   ${st.red(truncate(f, width - 20))}`);
    }
  }
  if (r.matrix) {
    const done = r.matrix.models.filter((m) => m.pass_rate !== null);
    const best = [...done].sort((a, b) => (b.pass_rate ?? 0) - (a.pass_rate ?? 0) || (a.cost_usd ?? Infinity) - (b.cost_usd ?? Infinity))[0];
    lines.push(
      table(
        ['MODEL', 'STATUS', 'PASS', '', 'COST', 'AVG LATENCY', 'FAILED'],
        r.matrix.models.map((m) => [
          (best && m.model === best.model ? st.green('★ ') : '  ') + st.bold(m.model),
          m.status,
          pct(m.pass_rate),
          bar(m.pass_rate ?? 0, 10, st, (m.pass_rate ?? 0) === 1 ? st.green : st.yellow),
          money(m.cost_usd, 3),
          m.avg_latency_ms === null ? '-' : `${Math.round(m.avg_latency_ms)}ms`,
          m.failed.length ? st.red(truncate(m.failed.join(', '), 40)) : st.dim('none'),
        ]),
        st,
        [2, 4, 5],
      ),
    );
  }
  return lines.join('\n');
}

export function renderBudget(h: { spend_usd: number | null; budget_usd: number }, st: Style, base: string): string {
  const spend = h.spend_usd ?? 0;
  const frac = h.budget_usd > 0 ? spend / h.budget_usd : 0;
  const color = frac > 0.85 ? st.red : frac > 0.6 ? st.yellow : st.green;
  const left = Math.max(0, h.budget_usd - spend);
  return [
    `${st.bold('Model budget')}  ${st.dim(base)}`,
    `${bar(frac, 30, st, color)}  ${money(spend, 2)} of ${money(h.budget_usd, 2)} spent (${pct(frac)})`,
    st.dim(`${money(left, 2)} left ≈ ${Math.floor(left / 0.28)} full 46-test deploys at ~$0.28 each`),
  ].join('\n');
}
