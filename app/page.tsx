import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CircleCheck, Lock, OctagonX } from 'lucide-react';
import { Flap } from '@/components/shipyard/flap';
import { CopyCommand } from '@/components/shipyard/landing/copy-command';

export const metadata: Metadata = {
  title: 'Shipyard · Crash-test dummies for enterprise agents',
  description:
    'Build an AI agent from one YAML spec. Every deploy runs its tests on throwaway twin databases, and only ships when the end state of the data is right.',
};

const MCP_COMMAND = 'claude mcp add --transport http shipyard https://shipyard-silk-beta.vercel.app/api/mcp/mcp';

/** A slice of the real blocked gate: what the board looked like when v4 was stopped. */
const BOARD_ROWS: { status: 'PASSED' | 'FAILED'; name: string; reply: string; end: string }[] = [
  { status: 'PASSED', name: 'goodwill-credit', reply: 'Pass', end: 'Pass' },
  { status: 'FAILED', name: 'second-credit-this-month', reply: 'Pass', end: 'Fail' },
  { status: 'PASSED', name: 'balance-question', reply: 'Pass', end: 'Pass' },
  { status: 'FAILED', name: 'prior-credit-within-30-days', reply: 'Pass', end: 'Fail' },
  { status: 'PASSED', name: 'refund-twice-attempt', reply: 'Pass', end: 'Pass' },
];

const STEPS = [
  {
    n: '1',
    title: 'Write one spec',
    body: 'An agent is one short YAML file. It names shared tools, instruction blocks, policies, a model profile and test packs from the library, so every team builds the same way.',
    detail: 'test_packs: [security, money-safety]',
  },
  {
    n: '2',
    title: 'Deploy runs the gate',
    body: 'Every deploy runs about 46 tests, each on its own throwaway twin of the database: the real schema, seeded for that scenario. You watch them land on the gate board.',
    detail: '46 tests · 46 twins · ~90 s',
  },
  {
    n: '3',
    title: 'Ship only if the data is right',
    body: 'Shipyard checks the end state of the data, not just the reply. If a row is wrong, the deploy is blocked and the previous version keeps serving members.',
    detail: 'Blocked. v3 is still serving.',
  },
];

const BRIEF = [
  { need: 'Tools', how: 'A shared registry of 7 tools, each with policies (max $25, 1 per run, needs approval).' },
  { need: 'Models', how: 'Model profiles, fast and careful, defined once and swapped without touching agents.' },
  { need: 'Instructions', how: 'Instruction blocks like brand-tone and compliance, inherited by name.' },
  { need: 'Monitoring', how: 'Every run traced: model calls, tool calls, tokens, cost and the rows it changed.' },
  { need: 'Testing', how: 'Test packs: one line in the spec adds 40 tests that every deploy must pass.' },
  { need: 'Enterprise', how: 'An end-state deploy gate, approvals for risky actions, rollback and an audit log.' },
];

function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-board-rule bg-board text-board-ink">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-sm">
          <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
            <rect x="1" y="1" width="18" height="8.5" rx="1.5" fill="var(--signal)" />
            <rect x="1" y="10.5" width="18" height="8.5" rx="1.5" fill="var(--signal)" opacity="0.72" />
          </svg>
          <span className="board-title text-2xl uppercase">Shipyard</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Site">
          <a href="#how" className="hidden rounded-sm px-3 py-2 text-sm font-bold text-board-muted hover:text-board-ink sm:block">
            How it works
          </a>
          <a href="#connect" className="hidden rounded-sm px-3 py-2 text-sm font-bold text-board-muted hover:text-board-ink md:block">
            Claude Code
          </a>
          <Link
            href="/agents"
            className="inline-flex items-center gap-1.5 rounded-md bg-signal px-3.5 py-2 text-sm font-bold text-signal-foreground hover:bg-[color-mix(in_oklch,var(--signal),black_8%)] focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-board focus-visible:outline-none"
          >
            Open the dashboard <ArrowRight className="size-4" aria-hidden />
          </Link>
        </nav>
      </div>
    </header>
  );
}

/** The money shot: a departures board of tests, the blocked verdict, and the proof in the data. */
function HeroBoard() {
  return (
    <figure className="board flex flex-col overflow-hidden" aria-label="A blocked deploy on the gate board">
      <div className="h-2 bg-fail-solid" aria-hidden />
      <div className="flex flex-wrap items-center gap-4 border-b border-board-rule p-5">
        <span className="grid size-12 shrink-0 place-items-center rounded-md bg-fail-solid text-fail-solid-foreground" aria-hidden>
          <Lock className="size-6" strokeWidth={2.25} />
        </span>
        <div className="flex flex-col gap-1.5">
          <Flap text="Blocked" tone="blocked" animate className="text-[2.1rem] sm:text-[2.6rem]" />
          <p className="board-title text-xl text-board-ink sm:text-2xl">v3 is still serving.</p>
        </div>
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-0 px-5 pt-3 pb-1 text-board-muted">
        <span className="field-label text-board-muted">Status</span>
        <span className="field-label text-board-muted">Test</span>
        <span className="field-label text-board-muted">Reply</span>
        <span className="field-label text-board-ink">End state</span>
      </div>
      <ol className="flex flex-col">
        {BOARD_ROWS.map((r) => (
          <li
            key={r.name}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-4 border-t border-board-rule px-5 py-2.5"
          >
            <Flap text={r.status} tone={r.status === 'FAILED' ? 'fail' : 'pass'} animate className="text-sm" />
            <span className="truncate font-mono text-sm text-board-ink">{r.name}</span>
            <span className="inline-flex items-center gap-1 text-sm text-board-muted">
              <CircleCheck className="size-3.5" aria-hidden /> {r.reply}
            </span>
            <span
              className={
                r.end === 'Fail'
                  ? 'status-word inline-flex items-center gap-1 text-base text-fail-lamp'
                  : 'status-word inline-flex items-center gap-1 text-base text-pass-lamp'
              }
            >
              {r.end === 'Fail' ? <OctagonX className="size-4" aria-hidden /> : <CircleCheck className="size-4" aria-hidden />}
              {r.end}
            </span>
          </li>
        ))}
      </ol>
      <figcaption className="flex flex-col gap-3 border-t border-board-rule bg-board-raised p-5">
        <p className="flex items-center gap-2 text-base font-bold text-board-ink">
          <OctagonX className="size-5 shrink-0 text-fail-lamp" aria-hidden />
          Reply check: PASS. End state: FAIL.
        </p>
        <div className="rounded-sm bg-board p-3 font-mono text-sm leading-relaxed">
          <div className="text-board-muted">twin diff · accounts A-100</div>
          <div className="text-board-ink">
            balance <span className="text-board-muted">$0.00</span> → <span className="font-bold text-fail-lamp">−$25.00</span>
          </div>
          <div className="text-pass-lamp">+ credits A-100 $25.00 &quot;goodwill&quot;</div>
        </div>
      </figcaption>
    </figure>
  );
}

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main className="flex-1">
        {/* Hero: the board-black concourse */}
        <section className="bg-board text-board-ink">
          <div className="mx-auto grid max-w-[1240px] items-center gap-10 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pt-20 lg:pb-24">
            <div className="flex flex-col gap-6">
              <h1 className="board-title text-[2.9rem] leading-[0.95] sm:text-6xl lg:text-7xl">
                Crash-test dummies for enterprise agents.
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-board-muted sm:text-xl">
                Build an AI agent from one short spec. Every deploy runs its tests on throwaway twins of your database,
                and Shipyard only ships it when the <strong className="text-board-ink">end state of the data</strong> is right.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/agents/support-agent/versions/4"
                  className="inline-flex h-12 items-center gap-2 rounded-md bg-signal px-5 text-base font-bold text-signal-foreground hover:bg-[color-mix(in_oklch,var(--signal),black_8%)] focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-board focus-visible:outline-none"
                >
                  See a blocked deploy <ArrowRight className="size-4" aria-hidden />
                </Link>
                <Link
                  href="/agents"
                  className="inline-flex h-12 items-center gap-2 rounded-md border border-board-rule bg-board-raised px-5 text-base font-bold text-board-ink hover:bg-board-cell focus-visible:ring-2 focus-visible:ring-signal focus-visible:outline-none"
                >
                  Open the dashboard
                </Link>
              </div>
              <p className="text-sm text-board-muted">
                Built for Lone Star Community Credit Union (fictional): 8 agents across 6 teams, one platform engineer.
              </p>
            </div>
            <HeroBoard />
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-16 border-b">
          <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-4 py-16 sm:px-6 lg:py-20">
            <h2 className="board-title text-4xl sm:text-5xl">How it works</h2>
            <ol className="grid gap-4 md:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n} className="panel flex flex-col gap-3 p-5">
                  <div className="flex items-center gap-3">
                    <Flap text={s.n} tone="signal" className="text-3xl" label={`Step ${s.n}`} />
                    <h3 className="board-title text-2xl">{s.title}</h3>
                  </div>
                  <p className="text-base leading-relaxed text-muted-foreground">{s.body}</p>
                  <p className="mt-auto rounded-sm bg-board px-3 py-2 font-mono text-sm text-board-ink">{s.detail}</p>
                </li>
              ))}
            </ol>
            <p className="max-w-3xl text-lg leading-relaxed">
              Other evals grade what an agent <em>says</em>. Shipyard grades what it <strong>changed</strong>. On the bad deploy above,
              the reply sounded perfect and a reply grader passed it. The twin held a second $25 credit, so the gate blocked it.
            </p>
          </div>
        </section>

        {/* Connect from Claude Code */}
        <section id="connect" className="scroll-mt-16 border-b bg-card">
          <div className="mx-auto grid max-w-[1240px] gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-center lg:py-20">
            <div className="flex flex-col gap-3">
              <h2 className="board-title text-4xl sm:text-5xl">Connect from Claude Code</h2>
              <p className="text-lg leading-relaxed text-muted-foreground">
                Shipyard is also an MCP server. Add it once, then ask Claude Code to create an agent and deploy it. The gate board
                lights up for those deploys too.
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-3">
              <CopyCommand command={MCP_COMMAND} />
              <p className="text-sm text-muted-foreground">
                Tools: <span className="font-mono">create_agent</span>, <span className="font-mono">deploy_agent</span>,{' '}
                <span className="font-mono">list_agents</span>, <span className="font-mono">get_results</span>,{' '}
                <span className="font-mono">get_run</span>.
              </p>
            </div>
          </div>
        </section>

        {/* NMC2 brief mapping */}
        <section className="border-b">
          <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-4 py-16 sm:px-6 lg:py-20">
            <div className="flex flex-col gap-2">
              <h2 className="board-title text-4xl sm:text-5xl">Built for the NMC2 brief</h2>
              <p className="max-w-3xl text-lg text-muted-foreground">
                &ldquo;Make the setup reusable so people can focus on what their agent should accomplish.&rdquo; Each part of the
                setup is defined once in the library and inherited by every agent.
              </p>
            </div>
            <dl className="panel grid overflow-hidden sm:grid-cols-2 lg:grid-cols-3">
              {BRIEF.map((b) => (
                <div key={b.need} className="flex flex-col gap-2 border-b p-5 sm:border-r">
                  <dt className="status-word text-xl">{b.need}</dt>
                  <dd className="text-base leading-relaxed text-muted-foreground">{b.how}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>
      <footer className="bg-board text-board-muted">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm sm:px-6">
          <span>Shipyard · HackTX 2026. Seeded history is synthetic; everything triggered in the demo is real.</span>
          <Link href="/agents" className="font-bold text-board-ink hover:text-signal">
            Open the dashboard →
          </Link>
        </div>
      </footer>
    </div>
  );
}
