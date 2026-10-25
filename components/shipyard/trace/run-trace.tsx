'use client';
// Run trace + twin diff (design/direction.md 7.2). Polls every 2 s while the run is in flight.
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, CircleCheck, CircleDashed, OctagonX, TriangleAlert } from 'lucide-react';
import type { RunTrace } from '@/lib/contracts/api';
import type { RunEvent, ScenarioResultSummary } from '@/lib/types';
import { cn } from '@/lib/utils';
import { getGate, getRun } from '../api';
import { verdicts } from '../gate/gate-model';
import { fmtCost, fmtDateTime } from '../format';
import { EmptyState, ErrorState, isNotFound, NotFoundState, Skeleton, StaleNotice } from '../states';
import { Flap } from '../flap';
import { StatusPill } from '../status';
import { useData, useNow } from '../use-data';
import { errorText, Timeline } from './timeline';
import { TwinDiffPanel } from './twin-diff';
import { Caption } from '../onboarding';

const POLL_MS = 2000;
/** A run still open after this long was abandoned (function killed); stop polling and say so. */
const STALE_RUN_MS = 15 * 60 * 1000;
const INFRA_RE = /rate limit|AI_APICallError|timed? ?out|ECONN|fetch failed|overloaded|503|502|504/i;

function isOpen(t: RunTrace): boolean {
  return t.run.ended_at === null && Date.now() - Date.parse(t.run.started_at) < STALE_RUN_MS;
}

function fmtSeconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)} s`;
}

function gateHref(agent: string, version: number | null): string {
  const a = encodeURIComponent(agent);
  return version !== null ? `/agents/${a}/versions/${version}` : `/agents/${a}`;
}

function TraceSkeleton() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6" aria-busy="true" aria-label="Loading run">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-8 w-80 max-w-full" />
      <Skeleton className="h-16 w-full" />
      <div className="grid gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-4 xl:col-span-7">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
        <Skeleton className="h-72 w-full xl:col-span-5" />
      </div>
    </div>
  );
}

function ErrorBanner({ events }: { events: RunEvent[] }) {
  const errs = events.filter((e) => e.type === 'error');
  const last = errs[errs.length - 1];
  const msg = last ? errorText(last.payload) : 'The run ended with an error but logged no error event.';
  const infra = !last || last.name === 'run' || last.name === 'rate_limit' || INFRA_RE.test(msg);
  return (
    <div role="alert" className="panel flex flex-col gap-3 overflow-hidden">
      <div className="h-1.5 bg-warn-solid" aria-hidden />
      <div className="flex flex-col gap-3 px-4 pb-4">
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
        <div className="min-w-0">
          <p className="board-title text-xl">{infra ? 'Infrastructure error, not a test failure.' : 'The run stopped with an error.'}</p>
          <p className="text-sm text-muted-foreground">
            {infra
              ? 'The model provider or platform failed mid-run, so the agent was never judged on this scenario. Redeploy to retry it.'
              : 'A tool call failed and the agent could not finish. See the error event in the timeline.'}
          </p>
        </div>
      </div>
      <pre className="max-h-48 overflow-auto rounded-[4px] border border-warn-border bg-warn-subtle px-3 py-2 font-mono text-[13px] whitespace-pre-wrap break-words text-warn">
        {msg}
      </pre>
      </div>
    </div>
  );
}

function OutcomePill({ t, open, result }: { t: RunTrace; open: boolean; result: ScenarioResultSummary | undefined }) {
  if (open) return <StatusPill status="running" />;
  if (t.run.outcome === 'error') return <StatusPill status="error" />;
  if (result?.status === 'failed' || result?.status === 'passed') return <StatusPill status={result.status} size="lg" />;
  if (t.run.ended_at === null) {
    return <span className="status-word rounded-sm bg-board px-1.5 py-1 text-[0.8125rem] text-board-muted">Never finished</span>;
  }
  return (
    <span className="status-word inline-flex items-center gap-1.5 rounded-sm bg-board px-1.5 py-1 text-[0.8125rem] text-board-ink">
      <CircleCheck className="size-3" strokeWidth={2} aria-hidden /> Completed
    </span>
  );
}

function Totals({ t, open }: { t: RunTrace; open: boolean }) {
  const now = useNow(1000, open);
  const { run, events } = t;
  const end = run.ended_at ? Date.parse(run.ended_at) : open ? now : null;
  const blocks = events.filter((e) => e.type === 'policy_block').length;
  const latency = end === null ? '—' : fmtSeconds(end - Date.parse(run.started_at));
  return (
    <dl className="board grid grid-cols-2 gap-px overflow-hidden bg-board-rule sm:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]">
      <div className="col-span-2 flex min-w-0 flex-col gap-2 bg-board px-4 py-3.5 sm:col-span-1 sm:px-5">
        <dt className="field-label text-board-muted">Tokens</dt>
        <dd className="font-mono text-lg font-semibold text-board-ink tabular-nums sm:text-xl">
          {(run.tokens_in ?? 0).toLocaleString()} <span className="text-sm font-normal text-board-muted">in</span> /{' '}
          {(run.tokens_out ?? 0).toLocaleString()} <span className="text-sm font-normal text-board-muted">out</span>
        </dd>
      </div>
      <div className="flex min-w-0 flex-col gap-2 bg-board px-4 py-3.5 sm:px-5">
        <dt className="field-label text-board-muted">Cost</dt>
        <dd>
          <Flap text={fmtCost(run.cost_usd)} tone="ink" className="text-2xl sm:text-[1.75rem]" />
        </dd>
      </div>
      <div className="flex min-w-0 flex-col gap-2 bg-board px-4 py-3.5 sm:px-5">
        <dt className="field-label text-board-muted">{open ? 'Elapsed' : 'Latency'}</dt>
        <dd className="font-mono text-lg font-semibold text-board-ink tabular-nums sm:text-xl">{latency}</dd>
      </div>
      <div className="col-span-2 flex min-w-0 flex-col gap-2 bg-board px-4 py-3.5 sm:col-span-1 sm:px-5">
        <dt className="field-label text-board-muted">Steps</dt>
        <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Flap text={String(events.length)} tone="ink" label={`${events.length} steps`} className="text-2xl sm:text-[1.75rem]" />
          {blocks > 0 && <span className="status-word text-base text-fail-lamp">· {blocks} blocked</span>}
        </dd>
      </div>
    </dl>
  );
}

/** This run's scenario result on its gate (end state + reply check), so the trace carries its own verdict. */
function useScenarioResult(t: RunTrace | null): ScenarioResultSummary | undefined {
  const run = t?.run;
  const enabled = !!run && run.mode === 'scenario' && run.version !== null && !!run.scenario;
  const { data } = useData(enabled ? `gate-for-run:${run!.agent}@${run!.version}` : 'gate-for-run:none', () =>
    enabled ? getGate(run!.agent, run!.version!) : Promise.resolve(null),
  );
  if (!enabled || !data) return undefined;
  return data.results.find((r) => r.run_id === run!.id) ?? data.results.find((r) => r.scenario === run!.scenario);
}

/** The tag's verdict at trace scale: End state first and loud, Reply check second and quiet, then the proof. */
function VerdictStrip({ r }: { r: ScenarioResultSummary }) {
  if (r.status !== 'failed' && r.status !== 'passed') return null;
  const v = verdicts(r);
  const failed = r.assertions.filter((a) => !a.passed);
  const fail = r.status === 'failed';
  return (
    <section aria-label="Verdict" className="board overflow-hidden">
      <div className={cn('h-1.5', fail ? 'bg-fail-solid' : 'bg-pass-solid')} aria-hidden />
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="field-label text-board-muted">End state</span>
          <span className="inline-flex items-center gap-2">
            {fail ? (
              <OctagonX className="size-7 text-fail-lamp" strokeWidth={2.25} aria-hidden />
            ) : (
              <CircleCheck className="size-7 text-pass-lamp" strokeWidth={2.25} aria-hidden />
            )}
            <Flap text={fail ? 'Fail' : 'Pass'} tone={fail ? 'fail' : 'pass'} className="text-3xl" />
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="field-label text-board-muted">Reply check</span>
          <span
            className={cn(
              'status-word inline-flex items-center gap-1 text-base',
              v.reply === null ? 'text-board-muted' : v.reply ? 'text-pass-lamp' : 'text-fail-lamp',
            )}
          >
            {v.reply === null ? <CircleDashed className="size-4" aria-hidden /> : v.reply ? <CircleCheck className="size-4" aria-hidden /> : <OctagonX className="size-4" aria-hidden />}
            {v.reply === null ? 'not graded' : v.reply ? 'pass' : 'fail'}
          </span>
        </div>
        {v.disagree && <p className="board-title text-xl text-board-ink sm:ml-auto sm:text-2xl">A reply-only eval would have shipped this.</p>}
      </div>
      {failed.length > 0 && (
        <ul className="grid gap-x-8 gap-y-3 border-t border-board-rule px-4 py-4 sm:grid-cols-2 sm:px-5">
          {failed.map((a, i) => (
            <li key={i} className="min-w-0 text-sm">
              {a.assertion.label && <div className="font-semibold text-board-ink">{a.assertion.label}</div>}
              <div className="mt-0.5 font-mono text-[13px] break-words text-board-muted">
                {a.expected} · got <span className="font-semibold text-fail-lamp">{a.actual}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RunTraceView({ id }: { id: string }) {
  const lastRef = useRef<RunTrace | null>(null);
  const { data: t, error, refetch } = useData(`run:${id}`, () => getRun(id), {
    pollMs: POLL_MS,
    // A failed poll passes null; keep polling while the last good data says the run is open.
    shouldPoll: (d) => {
      const cur = d ?? lastRef.current;
      return cur !== null && isOpen(cur);
    },
  });
  useEffect(() => {
    if (t) lastRef.current = t;
  }, [t]);
  const result = useScenarioResult(t);

  if (!t && isNotFound(error)) {
    return (
      <NotFoundState title="Run not found">
        No run with id <span className="font-mono text-foreground break-all">{id}</span>. It may have been cleaned up by a reset.
      </NotFoundState>
    );
  }
  if (!t && error) {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorState title="Couldn't load this run" error={error} onRetry={refetch} />
      </div>
    );
  }
  if (!t) return <TraceSkeleton />;

  const { run } = t;
  const open = isOpen(t);
  const showDiff = run.mode === 'scenario';
  const back = gateHref(run.agent, run.version);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          href={back}
          className="inline-flex items-center gap-1 self-start rounded-sm text-sm font-semibold text-link underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {run.version !== null ? `${run.agent} v${run.version} gate board` : run.agent}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="board-title min-w-0 text-3xl break-words sm:text-4xl">
            {run.scenario ? (
              <Link href={back} className="rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                {run.scenario.includes('/') && (
                  <span className="font-normal text-muted-foreground">{run.scenario.slice(0, run.scenario.indexOf('/') + 1)}</span>
                )}
                {run.scenario.slice(run.scenario.indexOf('/') + 1)}
              </Link>
            ) : (
              'Live conversation'
            )}
          </h1>
          <span className="rounded-[3px] border bg-card px-1.5 py-1 font-mono text-xs">{run.mode}</span>
          <OutcomePill t={t} open={open} result={result} />
        </div>
        <Caption>Every model call, tool call and the exact rows the agent changed in its twin database.</Caption>
        <p className="font-mono text-xs break-all text-muted-foreground">
          {run.id} · {fmtDateTime(run.started_at)}
        </p>
        <StaleNotice error={error} onRetry={refetch} />
        {result && <VerdictStrip r={result} />}
        <Totals t={t} open={open} />
        {run.outcome === 'error' && <ErrorBanner events={t.events} />}
        {showDiff && (
          <a href="#twin-diff" className="self-start rounded-sm text-sm font-semibold text-link underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none xl:hidden">
            Jump to twin diff
          </a>
        )}
      </header>

      <div className={cn('grid gap-6', showDiff && 'xl:grid-cols-12')}>
        <section aria-label="Timeline" className="min-w-0 xl:col-span-7">
          <h2 className="board-title mb-3 text-2xl">Timeline</h2>
          {t.events.length === 0 ? (
            <EmptyState title={open ? 'Run in progress' : 'No events recorded'}>
              {open
                ? 'Events appear here as the agent works. This page refreshes every 2 seconds.'
                : 'This run logged no model or tool calls.'}
            </EmptyState>
          ) : (
            <Timeline events={t.events} startedAt={run.started_at} />
          )}
          {open && t.events.length > 0 && <p className="mt-4 text-sm text-muted-foreground">Run in progress. Refreshing every 2 seconds.</p>}
          {run.final_reply && (
            <div className="panel mt-5 p-4 sm:p-5">
              <div className="field-label mb-2">Final reply</div>
              <p className="max-w-[70ch] text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap">{run.final_reply}</p>
            </div>
          )}
        </section>
        {showDiff && (
          <div className="min-w-0 xl:sticky xl:top-6 xl:col-span-5 xl:self-start">
            <TwinDiffPanel diff={t.diff} before={t.before_snapshot} after={t.after_snapshot} inProgress={open} />
          </div>
        )}
      </div>
    </div>
  );
}
