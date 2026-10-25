// The terminal gate board: a compact grid of every test tag grouped by source, with live counters,
// the verdict banner and "reply vs end state" lines for failures. Pure functions (GateResult -> text).
import type { GateResult, ScenarioResultSummary, ScenarioStatus } from '../../lib/types';
import { type Style, duration, money, oneLine, padEnd, pct, truncate, visibleLength } from './ansi';

export type TagStatus = ScenarioStatus | 'pending';

export interface Tag {
  scenario: string;
  group: string;
  status: TagStatus;
  attempts: ScenarioResultSummary[];
}

/** Group key from the naming convention in lib/types.ts: `<pack>/<name>` = pack, `gen-*` = generated, else spec. */
export function groupOf(scenario: string, r?: ScenarioResultSummary): string {
  if (r?.source === 'pack' && r.pack) return r.pack;
  if (r?.source === 'generated') return 'generated';
  if (r?.source === 'spec') return 'spec';
  const slash = scenario.indexOf('/');
  if (slash > 0) return scenario.slice(0, slash);
  return scenario.startsWith('gen-') ? 'generated' : 'spec';
}

/** Worst status wins once every attempt has finished; any running attempt keeps the tag running. */
export function aggregate(attempts: ScenarioResultSummary[]): TagStatus {
  if (attempts.length === 0) return 'pending';
  if (attempts.some((a) => a.status === 'running')) return 'running';
  if (attempts.some((a) => a.status === 'error')) return 'error';
  if (attempts.some((a) => a.status === 'failed')) return 'failed';
  return 'passed';
}

export function buildTags(g: GateResult): Tag[] {
  const byName = new Map<string, ScenarioResultSummary[]>();
  for (const r of g.results) {
    const list = byName.get(r.scenario) ?? [];
    list.push(r);
    byName.set(r.scenario, list);
  }
  const names = [...g.scenario_names];
  for (const n of byName.keys()) if (!names.includes(n)) names.push(n);
  return names.map((scenario) => {
    const attempts = (byName.get(scenario) ?? []).sort((a, b) => a.attempt - b.attempt);
    return { scenario, group: groupOf(scenario, attempts[0]), status: aggregate(attempts), attempts };
  });
}

export interface Counts {
  total: number;
  passed: number;
  failed: number;
  error: number;
  running: number;
  pending: number;
}

export function countTags(tags: Tag[]): Counts {
  const c: Counts = { total: tags.length, passed: 0, failed: 0, error: 0, running: 0, pending: 0 };
  for (const t of tags) c[t.status] += 1;
  return c;
}

const GROUP_ORDER = ['spec', 'generated'];
function groupRank(g: string): number {
  const i = GROUP_ORDER.indexOf(g);
  return i === -1 ? GROUP_ORDER.length : i;
}

export function glyph(status: TagStatus, st: Style, frame = 0): string {
  switch (status) {
    case 'passed':
      return st.green('✔');
    case 'failed':
      return st.red('✘');
    case 'error':
      return st.magenta('!');
    case 'running':
      return st.yellow('◐◓◑◒'[frame % 4]);
    default:
      return st.gray('·');
  }
}

function shortTag(t: Tag): string {
  const slash = t.scenario.indexOf('/');
  return slash > 0 ? t.scenario.slice(slash + 1) : t.scenario;
}

export interface BoardOptions {
  width: number;
  frame?: number;
  elapsedMs?: number;
  tagWidth?: number;
}

/** The live grid: header with counters, then one block per source group with wrapped tag chips. */
export function renderBoard(g: GateResult, st: Style, opts: BoardOptions): string[] {
  const tags = buildTags(g);
  const c = countTags(tags);
  const width = Math.max(50, Math.min(opts.width, 140));
  const tagW = opts.tagWidth ?? 18;
  const done = c.passed + c.failed + c.error;
  const state =
    g.status === 'running' ? st.yellow(`${glyph('running', st, opts.frame ?? 0)} gating`) : g.status === 'live' ? st.green('● live') : g.status === 'blocked' ? st.red('● blocked') : st.magenta('● error');
  const lines: string[] = [];
  lines.push(
    `${st.bold(`${g.agent} v${g.version}`)}  ${state}  ${st.dim(`${done}/${c.total} done`)}  ${st.green(`✔ ${c.passed}`)}  ${st.red(`✘ ${c.failed}`)}` +
      `${c.error ? `  ${st.magenta(`! ${c.error}`)}` : ''}  ${st.yellow(`◌ ${c.running + c.pending}`)}  ${st.dim(money(g.total_cost_usd, 3))}` +
      `${opts.elapsedMs !== undefined ? `  ${st.dim(duration(opts.elapsedMs))}` : ''}`,
  );
  const groups = [...new Set(tags.map((t) => t.group))].sort((a, b) => groupRank(a) - groupRank(b) || a.localeCompare(b));
  const labelW = Math.max(8, ...groups.map((x) => x.length + 6));
  for (const group of groups) {
    const inGroup = tags.filter((t) => t.group === group);
    const gc = countTags(inGroup);
    const label = padEnd(`${group} ${st.dim(`${gc.passed}/${gc.total}`)}`, labelW);
    const chips = inGroup.map((t) => {
      const name = truncate(shortTag(t), tagW - 3);
      const colored = t.status === 'failed' || t.status === 'error' ? st.red(name) : t.status === 'pending' ? st.gray(name) : t.status === 'running' ? st.yellow(name) : st.dim(name);
      return padEnd(`${glyph(t.status, st, opts.frame ?? 0)} ${colored}`, tagW);
    });
    const perLine = Math.max(1, Math.floor((width - labelW - 1) / tagW));
    for (let i = 0; i < chips.length; i += perLine) {
      const prefix = i === 0 ? label : ' '.repeat(labelW);
      lines.push(`${prefix} ${chips.slice(i, i + perLine).join('').trimEnd()}`);
    }
  }
  return lines;
}

export function renderVerdict(g: GateResult, st: Style): string[] {
  const rate = pct(g.pass_rate);
  const lines: string[] = [];
  if (g.status === 'live') {
    lines.push(`${st.bgGreen(' LIVE ')} ${st.bold(`${g.agent} v${g.version}`)} passed the gate  ·  pass rate ${rate}  ·  ${money(g.total_cost_usd)}`);
    lines.push(st.dim(`v${g.version} is now serving traffic.`));
  } else if (g.status === 'blocked') {
    lines.push(`${st.bgRed(' BLOCKED ')} ${st.bold(`${g.agent} v${g.version}`)} did not ship  ·  pass rate ${rate}  ·  ${money(g.total_cost_usd)}`);
    lines.push(st.dim(g.current_version ? `v${g.current_version} is still serving. Nothing changed for members.` : 'No version is serving yet.'));
  } else if (g.status === 'error') {
    lines.push(`${st.bgYellow(' ERROR ')} ${st.bold(`${g.agent} v${g.version}`)} gate errored  ·  ${money(g.total_cost_usd)}`);
  } else {
    lines.push(st.yellow(`${g.agent} v${g.version} still gating…`));
  }
  return lines;
}

/** Failure detail: what the end state got wrong, and whether the reply claimed otherwise. */
export function renderFailures(g: GateResult, st: Style, opts: { width: number; max?: number } = { width: 100 }): string[] {
  const failing = buildTags(g).filter((t) => t.status === 'failed' || t.status === 'error');
  if (failing.length === 0) return [];
  const lines: string[] = [st.bold(`Failures (${failing.length})`)];
  const max = opts.max ?? 20;
  for (const t of failing.slice(0, max)) {
    const bad = t.attempts.find((a) => a.status === 'failed' || a.status === 'error') ?? t.attempts[0];
    lines.push(`${glyph(t.status, st)} ${st.bold(t.scenario)} ${st.dim(`[${t.group}]${bad?.run_id ? `  run ${bad.run_id}` : ''}`)}`);
    if (!bad) continue;
    const failedAsserts = bad.assertions.filter((a) => !a.passed);
    const stateFails = failedAsserts.filter((a) => a.assertion.table);
    for (const a of failedAsserts.slice(0, 4)) {
      const label = a.assertion.label ? `${a.assertion.label}: ` : '';
      lines.push(`    ${a.critical ? st.red('critical') : st.yellow('check')}  ${label}expected ${a.expected}, got ${st.bold(a.actual)}`);
    }
    if (bad.status === 'error' && failedAsserts.length === 0) lines.push(`    ${st.magenta('the run errored before the end state could be checked')}`);
    if (bad.reply_check) {
      const replyOk = bad.reply_check.passed;
      if (replyOk && stateFails.length > 0) {
        lines.push(`    ${st.yellow('⚠ disagreement')}  reply ${st.green('looked fine')} · end state ${st.red('wrong')}  ${st.dim(truncate(oneLine(bad.reply_check.rationale), opts.width - 40))}`);
      } else {
        lines.push(`    reply ${replyOk ? st.green('ok') : st.red('flagged')}  ${st.dim(truncate(oneLine(bad.reply_check.rationale), opts.width - 20))}`);
      }
    }
    if (bad.final_reply) lines.push(`    ${st.dim('said:')} ${st.dim(`"${truncate(oneLine(bad.final_reply), opts.width - 14)}"`)}`);
  }
  if (failing.length > max) lines.push(st.dim(`  …and ${failing.length - max} more (use --json for everything)`));
  return lines;
}

/** One-line status change log for non-TTY output (CI logs). */
export function changeLine(t: Tag, st: Style): string {
  return `  ${glyph(t.status, st)} ${padEnd(t.status.toUpperCase(), 7)} ${t.scenario}${visibleLength(t.group) ? st.dim(`  [${t.group}]`) : ''}`;
}
