// Shipyard CLI program: commander wiring. `run(argv, io)` returns the exit code (no process.exit) so
// scripts/try-cli.ts can drive it with a mocked fetch. Exit codes: 0 ok/live, 1 blocked/invalid, 2 error.
import { Command, CommanderError } from 'commander';
import { makeStyle } from './lib/ansi';
import { type Ctx, CliExit, EXIT, type Io, processIo } from './lib/context';
import { ApiCallError, createClient, resolveBaseUrl } from './lib/http';
import { agentsCommand, budgetCommand, chatCommand, pushCommand, rollbackCommand, traceCommand, validateCommand } from './commands/basic';
import { type DeployOpts, deployCommand, resultsCommand } from './commands/gate';
import { type StressOpts, diffCommand, stressCommand } from './commands/stress';

interface GlobalOpts {
  api?: string;
  token?: string;
  json?: boolean;
  color?: boolean;
}

const EXAMPLES = `
Examples:
  shipyard agents
  shipyard validate support-agent --file agents/support-agent/spec.yaml --scenarios-dir agents/support-agent/scenarios
  shipyard deploy support-agent --file agents/support-agent/spec.yaml --watch
  shipyard deploy support-agent --ci                 # exit 0 live · 1 blocked · 2 error
  shipyard results support-agent 4
  shipyard trace <run_id>
  shipyard diff support-agent 3 4
  shipyard stress support-agent --mode reliability --runs 3
  shipyard budget --json

Env: SHIPYARD_API_URL, SHIPYARD_ADMIN_TOKEN, VERCEL_AUTOMATION_BYPASS_SECRET, NO_COLOR, SHIPYARD_POLL_MS`;

export async function run(argv: string[], io: Io = processIo): Promise<number> {
  let exitCode: number = EXIT.ok;
  const program = new Command()
    .name('shipyard')
    .description('Shipyard CLI: validate, gate, inspect and stress-test agents from your terminal or CI.')
    .option('--api <url>', 'API base URL (default $SHIPYARD_API_URL or the production URL)')
    .option('--token <token>', 'admin bearer token (default $SHIPYARD_ADMIN_TOKEN)')
    .option('--json', 'machine-readable JSON output')
    .option('--no-color', 'disable ANSI colors')
    .addHelpText('after', EXAMPLES)
    .exitOverride()
    .configureOutput({ writeOut: (s) => io.write(s), writeErr: (s) => io.write(s) });

  const ctxOf = (cmd: Command): Ctx => {
    const g = cmd.optsWithGlobals() as GlobalOpts;
    const colorOk = g.color !== false && !process.env.NO_COLOR && io.isTTY && !g.json;
    return {
      client: createClient({
        baseUrl: resolveBaseUrl(g.api),
        token: g.token ?? process.env.SHIPYARD_ADMIN_TOKEN,
        bypass: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      }),
      st: makeStyle(colorOk),
      io,
      json: g.json === true,
      pollMs: Math.max(5, Number(process.env.SHIPYARD_POLL_MS ?? 1500)),
    };
  };
  // Every action resolves to an exit code; errors are mapped once in the catch below.
  const act =
    <A extends unknown[]>(fn: (ctx: Ctx, ...args: A) => Promise<number>) =>
    async (...args: unknown[]) => {
      const cmd = args[args.length - 1] as Command;
      const positional = args.slice(0, -1) as A;
      exitCode = await fn(ctxOf(cmd), ...positional);
    };

  program.command('agents').description('list agents with serving version, status, pass rate and cost').action(act((ctx) => agentsCommand(ctx)));

  program
    .command('validate <agent>')
    .description('validate the server draft, or a local spec file (offline, never touches the draft)')
    .option('-f, --file <spec.yaml>', 'local spec file to validate')
    .option('--scenarios-dir <dir>', 'local scenarios folder to validate with --file')
    .action(act((ctx, agent: string, opts: { file?: string; scenariosDir?: string }) => validateCommand(ctx, agent, opts)));

  program
    .command('push <agent>')
    .description("replace the agent's draft spec with a local file (PUT /spec) and show validation")
    .requiredOption('-f, --file <spec.yaml>', 'spec file')
    .action(act((ctx, agent: string, opts: { file: string }) => pushCommand(ctx, agent, opts)));

  program
    .command('deploy <agent>')
    .description('deploy the draft through the gate; --watch draws the live gate board')
    .option('-f, --file <spec.yaml>', 'push this spec first')
    .option('-w, --watch', 'watch the gate live until the verdict')
    .option('--ci', 'CI mode: implies --watch, writes $GITHUB_STEP_SUMMARY, exit 0 live / 1 blocked / 2 error')
    .option('--summary <file>', 'append a markdown summary to this file')
    .option('--timeout <seconds>', 'give up watching after N seconds', '600')
    .action(act((ctx, agent: string, opts: DeployOpts) => deployCommand(ctx, agent, opts)));

  program
    .command('results <agent> <version>')
    .description('gate board + failures for a version (reply vs end state)')
    .option('--ci', 'exit 0 live / 1 blocked / 2 error')
    .option('--summary <file>', 'append a markdown summary to this file')
    .action(act((ctx, agent: string, version: string, opts: { ci?: boolean; summary?: string }) => resultsCommand(ctx, agent, version, opts)));

  program
    .command('trace <run_id>')
    .alias('run')
    .description('run timeline (model calls, tool calls, policy blocks) + twin diff')
    .action(act((ctx, id: string) => traceCommand(ctx, id)));

  program
    .command('diff <agent> <from> <to>')
    .description('spec diff + which tests newly fail / got fixed between two versions')
    .action(act((ctx, agent: string, from: string, to: string) => diffCommand(ctx, agent, from, to)));

  program
    .command('stress <agent>')
    .description('stress lab dry runs: reliability (N runs per test), redteam (generated attacks), matrix (models)')
    .option('-m, --mode <mode>', 'reliability | redteam | matrix')
    .option('--runs <n>', 'reliability: runs per test (2-5, default 3)')
    .option('--count <n>', 'redteam: attacks to generate (10-60, default 30)')
    .option('--models <a,b>', 'matrix: 2-4 comma-separated model strings')
    .option('--list', 'list past stress runs')
    .option('--id <stress_id>', 'show one stress run')
    .option('--no-watch', 'start and return immediately')
    .option('--ci', 'exit 1 when an attack broke through, a test is flaky, or no model passes everything')
    .option('--timeout <seconds>', 'give up watching after N seconds', '900')
    .action(act((ctx, agent: string, opts: StressOpts) => stressCommand(ctx, agent, opts)));

  program.command('budget').description('model spend vs the budget cap (GET /api/health)').action(act((ctx) => budgetCommand(ctx)));

  program.command('rollback <agent>').description('roll back to the previous live version').action(act((ctx, agent: string) => rollbackCommand(ctx, agent)));

  program
    .command('chat <agent>')
    .description('chat with the live version (interactive), or send one message with -m')
    .option('-m, --message <text>', 'send one message and exit')
    .action(act((ctx, agent: string, opts: { message?: string }) => chatCommand(ctx, agent, opts)));

  const errStyle = makeStyle(io.isTTY && !process.env.NO_COLOR && !argv.includes('--no-color'));
  const wantsJson = argv.includes('--json');
  try {
    await program.parseAsync(argv, { from: 'user' });
    return exitCode;
  } catch (e) {
    if (e instanceof CommanderError) {
      return e.exitCode === 0 ? EXIT.ok : EXIT.error; // help/version print and exit 0
    }
    if (e instanceof CliExit) {
      if (e.message) io.err(wantsJson ? JSON.stringify({ error: { code: 'cli', message: e.message } }) : errStyle.red(`✘ ${e.message}`));
      return e.code;
    }
    if (e instanceof ApiCallError) {
      if (wantsJson) io.err(JSON.stringify({ error: { status: e.status, code: e.code, message: e.message, details: e.details } }));
      else {
        io.err(errStyle.red(`✘ ${e.status ? `${e.status} ` : ''}${e.code}: ${e.message}`));
        if (e.code === 'unauthorized') io.err(errStyle.dim('  set SHIPYARD_ADMIN_TOKEN or pass --token'));
        if (e.code === 'rate_limited') io.err(errStyle.dim('  slow down: the server rate-limits deploys and model calls'));
        if (e.details) io.err(errStyle.dim(`  ${JSON.stringify(e.details).slice(0, 400)}`));
      }
      return EXIT.error;
    }
    io.err(errStyle.red(`✘ ${e instanceof Error ? e.message : String(e)}`));
    return EXIT.error;
  }
}
