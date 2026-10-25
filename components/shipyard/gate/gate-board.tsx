'use client';
// Gate board (design/direction.md 7.1). Polls every 1 s while the gate is running; renders placeholders for
// scenarios that have no result row yet; distinguishes infrastructure errors from FAIL verdicts.
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleCheck, CircleDashed, OctagonX, PlayCircle, Sparkles, TriangleAlert } from 'lucide-react';
import type { GateResult } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getGate, replayGate, USE_MOCKS } from '../api';
import { fmtCost, fmtDuration, fmtPct } from '../format';
import { ErrorState, Skeleton, StaleNotice } from '../states';
import { StatusPill } from '../status';
import { useData, useNow } from '../use-data';
import { GateCard } from './gate-card';
import { CatchSpotlight, RunningPanel, VerdictBanner } from './gate-banner';
import { boardResults, countResults, groupResults, isCriticalFail, tagCodes, verdicts, type GateCounts } from './gate-model';

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

function CountersStrip({ gate, counts }: { gate: GateResult; counts: GateCounts }) {
  const untested = gate.coverage?.tools_untested ?? null;
  // Numerals tick (180ms) as results land; keyed on the value so each change plays once. Never on a finished gate.
  const tick = gate.status === 'running';
  return (
    <div className="flex flex-col gap-2 border-y py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-base text-muted-foreground">
          <span className="text-3xl font-bold tabular-nums text-foreground">{counts.total}</span> tests
          <span aria-hidden>·</span>
          <span className="text-3xl font-bold tabular-nums text-foreground">{counts.packs}</span> {counts.packs === 1 ? 'pack' : 'packs'}
          {untested !== null && (
            <>
              <span aria-hidden>·</span>
              <span
                className={cn('inline-flex items-baseline gap-2', untested.length > 0 && 'text-warn')}
                title={untested.length ? `No test covers: ${untested.join(', ')}` : undefined}
              >
                <span className={cn('text-3xl font-bold tabular-nums', untested.length ? 'text-warn' : 'text-foreground')}>{untested.length}</span>
                untested {untested.length === 1 ? 'tool' : 'tools'}
                {untested.length > 0 && <TriangleAlert className="size-4 self-center" aria-hidden />}
              </span>
            </>
          )}
        </p>
        <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-base">
          <span className="inline-flex items-center gap-1.5 text-pass">
            <CircleCheck className="size-5" strokeWidth={1.75} aria-hidden />
            <span key={counts.passed} className={cn('inline-block text-2xl font-bold tabular-nums', tick && 'animate-counter-tick')}>{counts.passed}</span> passed
          </span>
          <span className={cn('inline-flex items-center gap-1.5', counts.failed > 0 ? 'text-fail' : 'text-muted-foreground')}>
            <OctagonX className="size-5" strokeWidth={1.75} aria-hidden />
            <span key={counts.failed} className={cn('inline-block text-2xl font-bold tabular-nums', tick && 'animate-counter-tick')}>{counts.failed}</span> failed
          </span>
          {counts.errored > 0 && (
            <span className="inline-flex items-center gap-1.5 text-warn" title="Infrastructure errors: the run broke before grading. Not failures.">
              <TriangleAlert className="size-5" strokeWidth={1.75} aria-hidden />
              <span key={counts.errored} className={cn('inline-block text-2xl font-bold tabular-nums', tick && 'animate-counter-tick')}>{counts.errored}</span> not graded
            </span>
          )}
          {(counts.running > 0 || gate.status === 'running') && (
            <span className="inline-flex items-center gap-1.5 text-running">
              <CircleDashed className="size-5 animate-running-ring" strokeWidth={1.75} aria-hidden />
              <span key={counts.running} className={cn('inline-block text-2xl font-bold tabular-nums', tick && 'animate-counter-tick')}>{counts.running}</span> running
            </span>
          )}
        </p>
      </div>
      {untested && untested.length > 0 && <p className="text-sm text-warn">No test covers {untested.join(', ')}.</p>}
      {counts.packs === 0 && counts.total > 0 && <p className="text-sm text-muted-foreground">Add test_packs to the spec to run the shared packs too.</p>}
      {counts.disagreements > 0 && (
        <p className="text-sm font-medium text-fail">
          {counts.disagreements} {counts.disagreements === 1 ? 'test' : 'tests'} passed the reply check but failed on the data.
        </p>
      )}
      {counts.errored > 0 && (
        <p className="text-sm text-muted-foreground">
          {counts.errored} {counts.errored === 1 ? 'run' : 'runs'} hit an infrastructure error (model rate limit or timeout). Those are not test failures.
        </p>
      )}
    </div>
  );
}

function Header({ gate, counts, now, onReplay }: { gate: GateResult; counts: GateCounts; now: number; onReplay: () => void }) {
  const running = gate.status === 'running';
  const elapsed = (gate.finished_at ? Date.parse(gate.finished_at) : now) - Date.parse(gate.started_at);
  // With infrastructure errors in the mix, the stored rate counts them against the agent. Show the rate over graded
  // tests instead (labelled), so "54%" doesn't misstate an agent that passed 25 of 26 checks it was actually given.
  const graded = counts.errored > 0 ? counts.passed + counts.failed : 0;
  return (
    <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex flex-col gap-1">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/agents" className="hover:text-foreground">Agents</Link> /{' '}
          <Link href={`/agents/${gate.agent}`} className="hover:text-foreground">{gate.agent}</Link>
        </nav>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold text-balance">{gate.agent}</h1>
          <span className="rounded-sm bg-muted px-1.5 font-mono text-base">v{gate.version}</span>
          <StatusPill status={gate.status} size="lg" />
          {USE_MOCKS && !running && (
            <Button variant="ghost" size="sm" onClick={onReplay}>
              <PlayCircle aria-hidden /> Replay gate
            </Button>
          )}
        </div>
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-sm tabular-nums">
        <div className="flex gap-1.5"><dt className="font-sans text-muted-foreground">{running ? 'Elapsed' : 'Took'}</dt><dd>{fmtDuration(elapsed)}</dd></div>
        <div className="flex gap-1.5"><dt className="font-sans text-muted-foreground">Cost</dt><dd>{fmtCost(gate.total_cost_usd)}</dd></div>
        <div className="flex gap-1.5">
          <dt className="font-sans text-muted-foreground">{running ? 'Running' : graded ? 'Pass rate (graded)' : 'Pass rate'}</dt>
          <dd>
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
  // The spotlight shows the catch: a reply-vs-data disagreement if there is one, else the first critical failure,
  // else any failure. Only once the verdict is in.
  const failures = all.filter((r) => r.status === 'failed');
  const spotlight = running
    ? undefined
    : (failures.find((r) => verdicts(r).disagree) ?? failures.find(isCriticalFail) ?? failures[0]);

  if (!valid) return <ErrorState title="That isn't a version number." error={new Error(`"${String(version)}" is not a valid version.`)} />;
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
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6">
      <VerdictBanner gate={gate} counts={counts} results={all} />
      <Header gate={gate} counts={counts} now={now} onReplay={doReplay} />
      <StaleNotice error={error} onRetry={refetch} />
      {running && <RunningPanel gate={gate} counts={counts} stalled={stalled} />}
      <CountersStrip gate={gate} counts={counts} />
      {spotlight && <CatchSpotlight r={spotlight} more={failures.length - 1} />}

      <section className="flex flex-col gap-6" aria-label="All tests">
        <div className="sticky top-0 z-10 -mx-1 flex items-center bg-background/95 px-1 py-2 backdrop-blur-[2px] max-lg:top-[88px]">
          <div className="inline-flex rounded-md border bg-card p-0.5 text-sm" role="tablist" aria-label="Filter tests">
            {filters.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                onClick={() => setFilter(key)}
                className={cn(
                  'rounded-sm px-3 py-1.5 font-medium tabular-nums transition-colors',
                  filter === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {groups.length === 0 && (
          <p className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
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
            <div key={g.key} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h2 className="flex items-center gap-1.5 text-lg font-semibold">
                  {g.key === 'generated' && <Sparkles className="size-4 text-muted-foreground" aria-hidden />}
                  {g.title}
                </h2>
                <span className="text-sm text-muted-foreground">{g.subtitle}</span>
                <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-sm tabular-nums text-muted-foreground">
                  {gc.total}
                  {gc.running > 0 && <span>· {gc.running} running</span>}
                  {gc.failed > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-sm bg-fail-solid px-1.5 py-0.5 font-sans font-semibold text-fail-solid-foreground">
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
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] items-start gap-3">
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
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6" aria-busy="true" aria-label="Loading gate">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-24 rounded-lg" />
      <Skeleton className="h-16" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-3">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    </div>
  );
}
