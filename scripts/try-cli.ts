// Offline harness for the Shipyard CLI: mocks fetch with a fake gate that progresses over polls, then
// checks exit codes, the CI job summary, stress/diff rendering and the cost estimate. Spends nothing.
//   npx tsx scripts/try-cli.ts          # assertions only (captured output)
//   npx tsx scripts/try-cli.ts --show   # also plays the live gate board in your terminal
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from '../cli/program';
import type { Io } from '../cli/lib/context';
import { stripAnsi } from '../cli/lib/ansi';
import type { StressResult, VersionDiff } from '../lib/contracts/stress';
import { estimateStressCost } from '../cli/lib/stress-types';
import type { GateResult, ScenarioResultSummary } from '../lib/types';

const SHOW = process.argv.includes('--show');
process.env.SHIPYARD_POLL_MS = SHOW ? '120' : '5';
delete process.env.GITHUB_STEP_SUMMARY;

// ---------- fake gate ----------
const PACKS: Record<string, string[]> = {
  spec: ['skip-payment', 'goodwill-credit', 'balance-question', 'ignore-rules-attack', 'refund-twice-attempt', 'external-email-attempt', 'second-credit-this-month'],
  security: ['direct-injection', 'fake-admin-mode', 'roleplay-jailbreak', 'hidden-instructions-in-email', 'base64-request', 'multi-turn-escalation', 'other-member-balance', 'reveal-system-prompt', 'fake-manager-approval', 'tool-name-injection'],
  compliance: ['no-rate-promise', 'account-data-to-external', 'other-member-data', 'statement-to-gmail', 'cc-third-party', 'brother-on-behalf', 'internal-email-allowed', 'sensitive-request-crm-note'],
  'money-safety': ['credit-cap', 'double-credit-one-conversation', 'prior-credit-within-30-days', 'wrong-account-credit', 'zero-or-negative-amount', 'split-into-small-credits', 'deferral-without-approval', 'deferral-manager-approved', 'refund-plus-credit', 'credit-on-zero-balance'],
  'read-only': ['balance', 'payment-date', 'account-status', 'how-credits-work', 'just-checking'],
  escalation: ['angry-member', 'threat-to-leave', 'out-of-scope-mortgage', 'legal-threat', 'bereavement', 'human-request'],
};
const NAMES = Object.entries(PACKS).flatMap(([p, xs]) => xs.map((x) => (p === 'spec' ? x : `${p}/${x}`)));
const FAILING = new Set(['second-credit-this-month', 'money-safety/prior-credit-within-30-days']);

function result(name: string, status: ScenarioResultSummary['status']): ScenarioResultSummary {
  const slash = name.indexOf('/');
  const fails = status === 'failed';
  return {
    scenario: name,
    attempt: 1,
    status,
    run_id: status === 'running' ? null : `run-${name.replace('/', '-')}`,
    assertions: fails
      ? [{ assertion: { table: 'credits', where: { account_id: 'A-100' }, count_lte: 1, critical: true, label: 'No second credit within 30 days' }, passed: false, expected: 'credits where account_id=A-100: count ≤ 1', actual: '2', critical: true }]
      : [],
    reply_check: fails ? { passed: true, rationale: 'The assistant was polite and resolved the request.' } : null,
    final_reply: fails ? 'Hi Dana, I applied a $25 goodwill credit to your account.' : 'ok',
    diff: null,
    source: slash > 0 ? 'pack' : 'spec',
    pack: slash > 0 ? name.slice(0, slash) : undefined,
  };
}

function gateAt(tick: number, finalStatus: 'live' | 'blocked'): GateResult {
  const per = 6;
  const done = Math.min(NAMES.length, tick * per);
  const results = NAMES.slice(0, Math.min(NAMES.length, done + per)).map((n, i) =>
    result(n, i >= done ? 'running' : finalStatus === 'blocked' && FAILING.has(n) ? 'failed' : 'passed'),
  );
  const finished = done >= NAMES.length;
  const passed = results.filter((r) => r.status === 'passed').length;
  return {
    agent: 'support-agent',
    version: 5,
    status: finished ? finalStatus : 'running',
    pass_rate: finished ? passed / NAMES.length : null,
    total_cost_usd: Math.round(done * 0.0062 * 1e4) / 1e4,
    started_at: new Date().toISOString(),
    finished_at: finished ? new Date().toISOString() : null,
    current_version: 3,
    scenario_names: NAMES,
    results,
    coverage: null,
  };
}

type Handler = (method: string, url: URL, body: unknown) => { status: number; json?: unknown; text?: string };
function mockFetch(handler: Handler) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url.pathname}${url.search}`);
    const r = handler(method, url, init?.body ? JSON.parse(String(init.body)) : undefined);
    const text = r.text ?? JSON.stringify(r.json);
    return new Response(text, { status: r.status, headers: { 'content-type': r.text ? 'text/html' : 'application/json' } });
  }) as typeof fetch;
  return calls;
}

function captureIo(isTTY = false): Io & { text(): string } {
  let buf = '';
  return {
    out: (s) => void (buf += `${s}\n`),
    err: (s) => void (buf += `${s}\n`),
    write: (s) => void (buf += s),
    isTTY,
    columns: 110,
    text: () => stripAnsi(buf),
  };
}

function gateServer(finalStatus: 'live' | 'blocked'): Handler {
  let tick = 0;
  return (method, url) => {
    if (method === 'PUT' && url.pathname.endsWith('/spec')) return { status: 200, json: { ok: true, errors: [] } };
    if (method === 'POST' && url.pathname.endsWith('/deploy')) return { status: 202, json: { version: 5, status: 'running' } };
    if (url.pathname.endsWith('/versions/5')) return { status: 200, json: gateAt(tick++, finalStatus) };
    return { status: 404, text: '<html>404</html>' };
  };
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shipyard-cli-'));
  const spec = path.join(tmp, 'spec.yaml');
  fs.writeFileSync(spec, 'name: support-agent\n');
  const summary = path.join(tmp, 'summary.md');

  // 1. deploy --ci on a blocked gate -> exit 1, failures + disagreement + job summary.
  const calls = mockFetch(gateServer('blocked'));
  let io = captureIo();
  let code = await run(['--api', 'http://mock', 'deploy', 'support-agent', '--file', spec, '--ci', '--summary', summary], io);
  assert.equal(code, 1, 'blocked gate exits 1 in --ci');
  assert.ok(calls[0].startsWith('PUT /api/agents/support-agent/spec'), 'pushes spec first');
  assert.ok(calls[1].startsWith('POST /api/agents/support-agent/deploy'));
  const out = io.text();
  assert.match(out, /BLOCKED/);
  assert.match(out, /v3 is still serving/);
  assert.match(out, /disagreement/);
  assert.match(out, /security 10\/10/);
  const md = fs.readFileSync(summary, 'utf8');
  assert.match(md, /⛔ Shipyard gate: `support-agent` v5 BLOCKED/);
  assert.match(md, /\| `second-credit-this-month` \|/);
  console.log('✔ deploy --ci blocked -> exit 1, summary written');

  // 2. deploy --ci on a passing gate -> exit 0.
  mockFetch(gateServer('live'));
  code = await run(['--api', 'http://mock', 'deploy', 'support-agent', '--ci'], captureIo());
  assert.equal(code, 0, 'live gate exits 0');
  console.log('✔ deploy --ci live -> exit 0');

  // 3. --json deploy prints exactly one JSON document (the final GateResult).
  mockFetch(gateServer('live'));
  io = captureIo();
  code = await run(['--api', 'http://mock', '--json', 'deploy', 'support-agent', '--watch'], io);
  assert.equal(code, 0);
  assert.equal((JSON.parse(io.text()) as GateResult).status, 'live');
  console.log('✔ deploy --watch --json -> single JSON result');

  // 4. live TTY board redraws in place (cursor-up sequences) and ends on the verdict.
  mockFetch(gateServer('blocked'));
  const tty = SHOW
    ? { out: (s: string) => process.stdout.write(`${s}\n`), err: (s: string) => process.stderr.write(`${s}\n`), write: (s: string) => process.stdout.write(s), isTTY: true, columns: process.stdout.columns || 110 }
    : captureIo(true);
  let raw = '';
  const ttyIo: Io = { ...tty, write: (s) => ((raw += s), tty.write(s)), out: (s) => ((raw += `${s}\n`), tty.out(s)) };
  code = await run(['--api', 'http://mock', 'deploy', 'support-agent', '--watch'], ttyIo);
  assert.equal(code, 1);
  assert.ok(raw.includes('\x1b[') && /\x1b\[\d+F/.test(raw), 'redraws with cursor movement');
  console.log('✔ deploy --watch (TTY) redraws the board in place');

  // 5. server error mid-deploy -> exit 2; missing stress route -> friendly message, exit 2.
  mockFetch(() => ({ status: 500, json: { error: { code: 'internal', message: 'boom' } } }));
  io = captureIo();
  assert.equal(await run(['--api', 'http://mock', 'deploy', 'x', '--ci'], io), 2);
  mockFetch(() => ({ status: 404, text: '<html>Not found</html>' }));
  io = captureIo();
  assert.equal(await run(['--api', 'http://mock', 'stress', 'support-agent', '--mode', 'redteam'], io), 2);
  assert.match(io.text(), /stress lab not deployed on this server/);
  io = captureIo();
  assert.equal(await run(['--api', 'http://mock', 'diff', 'support-agent', '3', '4'], io), 2);
  assert.match(io.text(), /not deployed/);
  console.log('✔ errors -> exit 2, missing stress/diff routes handled');

  // 6. stress reliability against a mocked stress lab.
  const stress: StressResult = {
    stress_id: 'st_1', agent: 'support-agent', mode: 'reliability', status: 'done', created_at: '2026-10-24T20:00:00Z', finished_at: '2026-10-24T20:02:00Z',
    total_cost_usd: 0.41, headline: 'Reliability 97.8% · 2 flaky tests',
    reliability: { runs: 3, reliability_pct: 97.8, scenarios: [
      { scenario: 'goodwill-credit', source: 'spec', passes: 3, runs: 3, flaky: false, run_ids: [] },
      { scenario: 'security/tool-name-injection', source: 'pack', pack: 'security', passes: 2, runs: 3, flaky: true, run_ids: [] },
    ] },
  };
  let posted: unknown = null;
  mockFetch((method, url, body) => {
    if (url.pathname.endsWith('/stress') && method === 'POST') return ((posted = body), { status: 202, json: { stress_id: 'st_1', status: 'running' } });
    if (url.pathname.endsWith('/stress/st_1')) return { status: 200, json: stress };
    if (url.pathname === '/api/agents/support-agent') return { status: 200, json: { current_version: 5, versions: [] } };
    if (url.pathname.endsWith('/versions/5')) return { status: 200, json: gateAt(99, 'live') };
    return { status: 404, text: 'nope' };
  });
  io = captureIo();
  code = await run(['--api', 'http://mock', 'stress', 'support-agent', '--mode', 'reliability', '--runs', '3', '--ci'], io);
  assert.deepEqual(posted, { mode: 'reliability', runs: 3 });
  assert.equal(code, 1, 'flaky test fails --ci');
  assert.match(io.text(), /estimate: 138 scenario runs ≈ \$0\.83/);
  assert.match(io.text(), /FLAKY/);
  console.log('✔ stress reliability: estimate, flaky flag, --ci exit 1');

  // 7. 402 budget refusal and argument validation.
  mockFetch((method) => (method === 'POST' ? { status: 402, json: { error: { code: 'budget_exceeded', message: 'would exceed budget', details: { estimate_usd: 9, remaining_usd: 1.2 } } } } : { status: 404, text: 'x' }));
  io = captureIo();
  assert.equal(await run(['--api', 'http://mock', 'stress', 'support-agent', '--mode', 'matrix'], io), 2);
  assert.match(io.text(), /budget exceeded: would exceed budget \(estimate \$9\.00, remaining \$1\.20\)/);
  io = captureIo();
  assert.equal(await run(['stress', 'a', '--mode', 'reliability', '--runs', '9'], io), 2);
  assert.match(io.text(), /--runs must be 2-5/);
  console.log('✔ stress 402 + arg validation');

  // 8. diff rendering.
  const diff: VersionDiff = {
    from: 3, to: 4,
    spec_diff: [
      { line: 1, kind: 'same', text: 'name: support-agent' },
      { line: 2, kind: 'del', text: '  Check credits_last_30_days before any credit.' },
      { line: 2, kind: 'add', text: '  Be generous with credits.' },
    ],
    scenarios: [
      { scenario: 'second-credit-this-month', from_status: 'passed', to_status: 'failed', change: 'newly_failing' },
      { scenario: 'balance-question', from_status: 'passed', to_status: 'passed', change: 'still_passing' },
    ],
  };
  mockFetch(() => ({ status: 200, json: diff }));
  io = captureIo();
  assert.equal(await run(['--api', 'http://mock', 'diff', 'support-agent', '3', '4'], io), 0);
  assert.match(io.text(), /- +Check credits_last_30_days/);
  assert.match(io.text(), /newly failing \(1\)\n {4}second-credit-this-month passed → failed/);
  console.log('✔ diff renders spec changes + newly failing tests');

  // 9. cost estimate math.
  assert.deepEqual(estimateStressCost({ mode: 'reliability' }, 46), { runs: 138, usd: 0.83 });
  assert.deepEqual(estimateStressCost({ mode: 'redteam', count: 100 }, 46), { runs: 60, usd: 0.36 });
  assert.deepEqual(estimateStressCost({ mode: 'matrix', models: ['a', 'b'] }, 46), { runs: 92, usd: 0.55 });
  console.log('✔ cost estimate');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\nall CLI checks passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
