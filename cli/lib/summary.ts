// Markdown job summary for CI ($GITHUB_STEP_SUMMARY): verdict, counts by source, and a table of failures.
import type { GateResult } from '../../lib/types';
import { buildTags, countTags } from './board';

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

export function gateSummaryMarkdown(g: GateResult, baseUrl: string): string {
  const tags = buildTags(g);
  const c = countTags(tags);
  const icon = g.status === 'live' ? '✅' : g.status === 'blocked' ? '⛔' : '⚠️';
  const verdict = g.status === 'live' ? 'LIVE' : g.status === 'blocked' ? 'BLOCKED' : g.status.toUpperCase();
  const rate = g.pass_rate === null ? '-' : `${(g.pass_rate * 100).toFixed(1)}%`;
  const lines: string[] = [
    `## ${icon} Shipyard gate: \`${g.agent}\` v${g.version} ${verdict}`,
    '',
    `**${c.passed}/${c.total}** tests passed · pass rate **${rate}** · cost $${(g.total_cost_usd ?? 0).toFixed(4)}` +
      (g.status === 'blocked' && g.current_version ? ` · v${g.current_version} is still serving` : ''),
    '',
  ];
  const groups = [...new Set(tags.map((t) => t.group))];
  lines.push('| Source | Passed | Failed |', '|---|---:|---:|');
  for (const grp of groups) {
    const gc = countTags(tags.filter((t) => t.group === grp));
    lines.push(`| ${esc(grp)} | ${gc.passed} | ${gc.failed + gc.error} |`);
  }
  const failing = tags.filter((t) => t.status === 'failed' || t.status === 'error');
  if (failing.length) {
    lines.push('', '### Failures', '', '| Test | What went wrong | Reply check | Trace |', '|---|---|---|---|');
    for (const t of failing) {
      const bad = t.attempts.find((a) => a.status !== 'passed') ?? t.attempts[0];
      const what = bad
        ? bad.assertions
            .filter((a) => !a.passed)
            .map((a) => `${a.critical ? '**critical** ' : ''}${a.assertion.label ? `${a.assertion.label}: ` : ''}expected ${a.expected}, got ${a.actual}`)
            .join('<br>') || (bad.status === 'error' ? 'run errored' : '-')
        : '-';
      const reply = bad?.reply_check ? (bad.reply_check.passed ? 'reply looked fine (end state disagrees)' : 'reply flagged') : '-';
      const trace = bad?.run_id ? `[${bad.run_id.slice(0, 8)}](${baseUrl}/runs/${bad.run_id})` : '-';
      lines.push(`| \`${esc(t.scenario)}\` | ${esc(what)} | ${reply} | ${trace} |`);
    }
  }
  lines.push('', `[Open the gate report](${baseUrl}/agents/${g.agent}/versions/${g.version})`, '');
  return lines.join('\n');
}
