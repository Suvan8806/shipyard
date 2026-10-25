'use client';
// Gate board (design/direction.md 7.1). Polls every 1 s while the gate is running; renders placeholders for
// scenarios that have no result row yet; distinguishes infrastructure errors from FAIL verdicts.
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { OctagonX, PlayCircle, Sparkles, TriangleAlert } from 'lucide-react';
import type { GateResult, ScenarioResultSummary } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getGate, replayGate, USE_MOCKS } from '../api';
import { fmtCost, fmtDuration, fmtPct } from '../format';
import { ErrorState, isNotFound, NotFoundState, Skeleton, StaleNotice } from '../states';
import { StatusPill } from '../status';
import { useData, useNow } from '../use-data';
import { Flap, type FlapTone } from '../flap';
import { GateCard } from './gate-card';
import { Caption } from '../onboarding';
import { CatchSpotlight, RunningPanel, VerdictBanner } from './gate-banner';
import { boardResults, countResults, groupResults, pickSpotlight, shortName, tagCodes, type GateCounts } from './gate-model';

type Filter = 'all' | 'failed' | 'critical' | 'errored';
/** No tag finished for this long while running: switch to the calm "still running" copy. */
const STALL_MS = 45_000;

/** Timestamp of the last time the number of finished tags changed. */
function useLastProgress(done: number | undefined): number {
  const [at, setAt] = useState(() => Date.now());
  const prev = useRef(done);
  useEffect(() => {
    if (prev.current !== done) {
      prev.current = done;
      setAt(Date.now());
    }
  }, [done]);
  return at;
}

/**
 * The gate at a glance: one lamp per test, in board order, lit as each verdict lands. Green passed, red failed,
 * orange not graded, cyan blinking while running. Reads from across the room before any number does.
 */
function LampStrip({ results }: { results: ScenarioResultSummary[] }) {
  if (results.length === 0) return null;
  return (
    <ol className="flex flex-wrap gap-[3px]" aria-label="Every test, in board order">
      {results.map((r) => (
        <li
          key={r.scenario}
          title={`${shortName(r)}: ${r.status}`}
          className={cn(
            'h-5 w-2.5 rounded-[2px] transition-colors duration-500 sm:h-6 sm:w-3',
            r.status === 'passed' && 'bg-pass-solid',
            r.status === 'failed' && 'bg-fail-solid',
            r.status === 'error' && 'bg-warn-solid',
            r.status === 'running' && 'animate-pulse bg-running-solid/70',
          )}
        >
          <span className="sr-only">
            {shortName(r)}: {r.status}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Tally({ n, label, tone, show = true }: { n: number; label: string; tone: FlapTone; show?: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <Flap text={String(n)} tone={tone} className="text-2xl" />
      <span className="text-sm font-bold text-muted-foreground">{label}</span>
    </span>
  );
}

function CountersStrip({ gate, counts, results }: { gate: GateResult; counts: GateCounts; results: ScenarioResultSummary[] }) {
  const untested = gate.coverage?.tools_untested ?? null;
  const running = counts.running > 0 || gate.status === 'running';
  return (
    <section className="panel flex flex-col gap-4 p-4 sm:p-5" aria-label="Gate counts">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <p className="flex flex-wrap items-baseline gap-x-5 gap-y-2 text-base text-muted-foreground">
          <span className="inline-flex items-baseline gap-2">
            <span className="board-title text-4xl text-foreground tabular-nums">{counts.total}</span>
            <span className="font-bold">tests</span>
          </span>
          <span className="inline-flex items-baseline gap-2">
            <span className="board-title text-4xl text-foreground tabular-nums">{counts.packs}</span>
            <span className="font-bold">{counts.packs === 1 ? 'pack' : 'packs'}</span>
          </span>
          {untested !== null && (
            <span
              className={cn('inline-flex items-baseline gap-2', untested.length > 0 && 'text-warn')}
              title={untested.length ? `No test covers: ${untested.join(', ')}` : undefined}
            >
              <span className={cn('board-title text-4xl tabular-nums', untested.length ? 'text-warn' : 'text-foreground')}>{untested.length}</span>
              <span className="font-bold">untested {untested.length === 1 ? 'tool' : 'tools'}</span>
              {untested.length > 0 && <TriangleAlert className="size-4 self-center" aria-hidden />}
            </span>
          )}
        </p>
        <p className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Tally n={counts.passed} label="passed" tone="pass" />
          <Tally n={counts.failed} label="failed" tone={counts.failed > 0 ? 'fail' : 'muted'} />
          <Tally n={counts.errored} label="not graded" tone="warn" show={counts.errored > 0} />
          <Tally n={counts.running} label="running" tone="running" show={running} />
        </p>
      </div>
      <LampStrip results={results} />
      <div className="flex flex-col gap-1 empty:hidden">
        {counts.disagreements > 0 && (
          <p className="flex items-center gap-1.5 text-base font-bold text-fail">
            <OctagonX className="size-4 shrink-0" strokeWidth={2.25} aria-hidden />
            {counts.disagreements} {counts.disagreements === 1 ? 'test' : 'tests'} passed the reply check but failed on the data.
          </p>
        )}
        {untested && untested.length > 0 && <p className="text-sm text-warn">No test covers {untested.join(', ')}.</p>}
        {counts.packs === 0 && counts.total > 0 && <p className="text-sm text-muted-foreground">Add test_packs to the spec to run the shared packs too.</p>}
        {counts.errored > 0 && (
          <p className="text-sm text-muted-foreground">
            {counts.errored} {counts.errored === 1 ? 'run' : 'runs'} hit an infrastructure error (model rate limit or timeout). Those are not test failures.
          </p>
        )}
      </div>
    </section>
  );
}

function Header({ gate, counts, now, onReplay }: { gate: GateResult; counts: GateCounts; now: number; onReplay: () => void }) {
  const running = gate.status === 'running';
  const elapsed = (gate.finished_at ? Date.parse(gate.finished_at) : now) - Date.parse(gate.started_at);
  // With infrastructure errors in the mix, the stored rate counts them against the agent. Show the rate over graded
  // tests instead (labelled), so "54%" doesn't misstate an agent that passed 25 of 26 checks it was actually given.
  const graded = counts.errored > 0 ? counts.passed + counts.failed : 0;
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/agents" className="font-bold hover:text-foreground">Agents</Link>
          <span aria-hidden> / </span>
          <Link href={`/agents/${gate.agent}`} className="font-bold hover:text-foreground">{gate.agent}</Link>
          <span aria-hidden> / </span>
          <span>gate</span>
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="board-title text-3xl break-all sm:text-4xl">{gate.agent}</h1>
          <Flap text={`v${gate.version}`} tone="signal" className="text-[1.6rem]" label={`version ${gate.version}`} />
          <StatusPill status={gate.status} size="lg" />
          {USE_MOCKS && !running && (
            <Button variant="ghost" size="sm" onClick={onReplay}>
              <PlayCircle aria-hidden /> Replay gate
            </Button>
          )}
        </div>
        <Caption>Each row is one test run on a throwaway copy of the database. The end state of the data decides; the reply check is shown but never decides.</Caption>
      </div>
      <dl className="grid grid-cols-3 gap-x-6 gap-y-1 sm:flex sm:flex-wrap sm:gap-x-8">
        <div className="flex flex-col gap-0.5">
          <dt className="field-label">{running ? 'Elapsed' : 'Took'}</dt>
          <dd className="font-mono text-lg tabular-nums">{fmtDuration(elapsed)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="field-label">Cost</dt>
          <dd className="font-mono text-lg tabular-nums">{fmtCost(gate.total_cost_usd)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="field-label">{running ? 'Running' : graded ? 'Pass rate (graded)' : 'Pass rate'}</dt>
          <dd className="font-mono text-lg tabular-nums">
            {running
              ? `${counts.done} / ${counts.total}`
              : graded
                ? fmtPct(counts.passed / graded)
                : gate.pass_rate === null
                  ? `${counts.passed}/${counts.total}`
                  : fmtPct(gate.pass_rate)}
          </dd>
        </div>
      </dl>
    </header>
  );
}

export function GateBoard({ name, version }: { name: string; version: number }) {
  const [nonce, setNonce] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const valid = Number.isInteger(version) && version > 0;
  const { data: gate, error, refetch } = useData(`${name}@${version}#${nonce}`, () => getGate(name, version), {
    pollMs: 1000,
    shouldPoll: (g) => valid && (!g || g.status === 'running'),
  });
  const running = gate?.status === 'running';
  const now = useNow(1000, running);

  const all = useMemo(() => (gate ? boardResults(gate) : []), [gate]);
  const counts = useMemo(() => countResults(all), [all]);
  const codes = useMemo(() => tagCodes(groupResults(all)), [all]);
  const groups = useMemo(() => {
    const visible = all.filter((r) =>
      filter === 'failed'
        ? r.status === 'failed'
        : filter === 'errored'
          ? r.status === 'error'
          : filter === 'critical'
          ? r.status === 'failed' && r.assertions.some((a) => !a.passed && a.critical)
          : true,
    );
    const gs = groupResults(visible);
    // Once the verdict is in, groups holding a failure move to the top so the catch is in the first viewport.
    // Never while running: groups would jump around as results land.
    if (gate?.status === 'running') return gs;
    const hasFail = (g: (typeof gs)[number]) => (g.results.some((r) => r.status === 'failed') ? 0 : 1);
    return [...gs].sort((a, b) => hasFail(a) - hasFail(b));
  }, [all, filter, gate?.status]);
  const lastProgress = useLastProgress(gate ? counts.done : undefined);
  // The spotlight shows the catch: a reply-vs-data disagreement if there is one (the agent's own spec scenarios
  // first, then packs), else the first critical failure, else any failure. Only once the verdict is in.
  const failures = all.filter((r) => r.status === 'failed');
  const spotlight = running ? undefined : pickSpotlight(all);

  if (!valid) {
    return (
      <NotFoundState title="Version not found" backHref={`/agents/${encodeURIComponent(name)}`} backLabel={`Back to ${name}`}>
        That isn&apos;t a version number.
      </NotFoundState>
    );
  }
  if (!gate && isNotFound(error)) {
    const agentMissing = error?.message.startsWith('agent ');
    return agentMissing ? (
      <NotFoundState title="Agent not found">
        There is no agent named <span className="font-mono text-foreground">{name}</span>.
      </NotFoundState>
    ) : (
      <NotFoundState title="Version not found" backHref={`/agents/${encodeURIComponent(name)}`} backLabel={`Back to ${name}`}>
        <span className="font-mono text-foreground">{name}</span> has no v{version}.
      </NotFoundState>
    );
  }
  if (error && !gate) return <ErrorState title={`Could not load the gate for ${name} v${version}.`} error={error} onRetry={refetch} />;
  if (!gate) return <GateBoardSkeleton />;

  const stalled = running && now - lastProgress > STALL_MS;
  const doReplay = async () => {
    await replayGate(name, version);
    setNonce((n) => n + 1);
  };
  const filters: [Filter, string][] = [
    ['all', `All ${counts.total}`],
    ['failed', `Failed ${counts.failed}`],
    ['critical', `Critical ${counts.criticalFailed}`],
    ...(counts.errored > 0 ? ([['errored', `Not graded ${counts.errored}`]] as [Filter, string][]) : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <VerdictBanner gate={gate} counts={counts} results={all} />
      <Header gate={gate} counts={counts} now={now} onReplay={doReplay} />
      <StaleNotice error={error} onRetry={refetch} />
      {running && <RunningPanel gate={gate} counts={counts} stalled={stalled} />}
      <CountersStrip gate={gate} counts={counts} results={all} />
      {spotlight && <CatchSpotlight r={spotlight} more={failures.length - 1} />}

      <section className="flex flex-col gap-5" aria-label="All tests">
        <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 bg-background/95 px-1 py-2 max-lg:top-[104px]">
          <h2 className="board-title text-2xl">Every test</h2>
          <div className="inline-flex rounded-md bg-board p-[3px] shadow-(--shadow-panel)" role="tablist" aria-label="Filter tests">
            {filters.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                onClick={() => setFilter(key)}
                className={cn(
                  'status-word rounded-sm px-3 py-2 text-[0.9375rem] tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-signal focus-visible:outline-none',
                  filter === key ? 'bg-signal text-signal-foreground' : 'text-board-muted hover:text-board-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {groups.length === 0 && (
          <p className="panel border-dashed p-8 text-center text-muted-foreground shadow-none">
            {counts.total === 0
              ? 'No tests yet. Spinning up twins…'
              : filter === 'all'
                ? 'No tests in this gate.'
                : running
                  ? 'Nothing here yet. Tests are still running.'
                  : filter === 'failed'
                    ? counts.errored > 0
                      ? 'No end-state check failed. Some tests could not be graded; see Not graded.'
                      : 'No failures. Every end-state check passed.'
                    : filter === 'errored'
                      ? 'No infrastructure errors.'
                      : 'No critical failures.'}
          </p>
        )}
        {groups.map((g) => {
          const gc = countResults(g.results);
          return (
            <div key={g.key} className="panel overflow-hidden">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/60 px-3 py-2.5 sm:px-4">
                <h3 className="flex items-center gap-1.5 font-display text-xl font-extrabold">
                  {g.key === 'generated' && <Sparkles className="size-4 text-muted-foreground" aria-hidden />}
                  {g.title}
                </h3>
                <span className="text-sm text-muted-foreground">{g.subtitle}</span>
                <span className="ml-auto inline-flex items-center gap-2 font-mono text-sm tabular-nums text-muted-foreground">
                  {gc.total}
                  {gc.running > 0 && <span>· {gc.running} running</span>}
                  {gc.failed > 0 && (
                    <span className="status-word inline-flex items-center gap-1 rounded-sm bg-fail-solid px-1.5 py-1 text-xs text-fail-solid-foreground">
                      <OctagonX className="size-3.5" aria-hidden /> {gc.failed} failed
                    </span>
                  )}
                  {gc.errored > 0 && (
                    <span className="inline-flex items-center gap-1">
                      · <TriangleAlert className="size-3.5 text-warn" aria-hidden /> {gc.errored} not graded
                    </span>
                  )}
                </span>
              </div>
              <div
                className="hidden grid-cols-[7.4rem_4.25rem_minmax(0,1fr)_7.5rem_8.5rem] gap-x-4 border-b px-4 py-1.5 md:grid"
                aria-hidden
              >
                <span className="field-label">Status</span>
                <span className="field-label">Code</span>
                <span className="field-label">Test</span>
                <span className="field-label">Reply check</span>
                <span className="field-label text-foreground">End state</span>
              </div>
              <div>
                {g.results.map((r) => (
                  <GateCard key={r.scenario} r={r} code={codes.get(r.scenario) ?? g.code} />
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

export function GateBoardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading gate">
      <Skeleton className="h-36 rounded-lg" />
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-20" />
      <div className="panel flex flex-col divide-y">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
