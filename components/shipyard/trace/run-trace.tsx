'use client';
// Run trace + twin diff (design/direction.md 7.2). Polls every 2 s while the run is in flight.
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, CircleCheck, CircleDashed, OctagonX, SearchX, TriangleAlert } from 'lucide-react';
import type { RunTrace } from '@/lib/contracts/api';
import type { RunEvent, ScenarioResultSummary } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ApiRequestError, getGate, getRun } from '../api';
import { verdicts } from '../gate/gate-model';
import { fmtCost, fmtDateTime } from '../format';
import { EmptyState, ErrorState, Skeleton, StaleNotice } from '../states';
import { StatusPill } from '../status';
import { useData, useNow } from '../use-data';
import { errorText, Timeline } from './timeline';
import { TwinDiffPanel } from './twin-diff';

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
    <div role="alert" className="flex flex-col gap-2 rounded-md border border-warn-border bg-warn-subtle p-4">
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold">{infra ? 'Infrastructure error, not a test failure.' : 'The run stopped with an error.'}</p>
          <p className="text-sm text-muted-foreground">
            {infra
              ? 'The model provider or platform failed mid-run, so the agent was never judged on this scenario. Redeploy to retry it.'
              : 'A tool call failed and the agent could not finish. See the error event in the timeline.'}
          </p>
        </div>
      </div>
      <pre className="max-h-48 overflow-auto rounded-md border border-warn-border bg-card px-3 py-2 font-mono text-[13px] whitespace-pre-wrap break-words text-warn">
        {msg}
      </pre>
    </div>
  );
}

function OutcomePill({ t, open, result }: { t: RunTrace; open: boolean; result: ScenarioResultSummary | undefined }) {
  if (open) return <StatusPill status="running" />;
  if (t.run.outcome === 'error') return <StatusPill status="error" />;
  if (result?.status === 'failed' || result?.status === 'passed') return <StatusPill status={result.status} size="lg" />;
  if (t.run.ended_at === null) {
    return <span className="rounded-sm border bg-draft-subtle px-1.5 py-0.5 text-xs font-semibold text-draft">Never finished</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border bg-card px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">
      <CircleCheck className="size-3" strokeWidth={2} aria-hidden /> Completed
    </span>
  );
}

function Totals({ t, open }: { t: RunTrace; open: boolean }) {
  const now = useNow(1000, open);
  const { run, events } = t;
  const end = run.ended_at ? Date.parse(run.ended_at) : open ? now : null;
  const blocks = events.filter((e) => e.type === 'policy_block').length;
  const items = [
    { label: 'Tokens', value: `${(run.tokens_in ?? 0).toLocaleString()} in / ${(run.tokens_out ?? 0).toLocaleString()} out` },
    { label: 'Cost', value: fmtCost(run.cost_usd) },
    { label: open ? 'Elapsed' : 'Latency', value: end === null ? '—' : fmtSeconds(end - Date.parse(run.started_at)) },
    { label: 'Steps', value: `${events.length}${blocks ? ` · ${blocks} blocked` : ''}` },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-md border bg-card px-4 py-3 sm:flex sm:flex-wrap sm:gap-x-10">
      {items.map((x, i) => (
        <div key={x.label} className={cn('min-w-0', i === 0 && 'col-span-2 sm:col-auto')}>
          <dt className="field-label">{x.label}</dt>
          <dd className="font-mono text-base font-semibold tabular-nums">{x.value}</dd>
        </div>
      ))}
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
    <section aria-label="Verdict" className={cn('overflow-hidden rounded-md border bg-card', fail && 'border-fail-solid')}>
      <div className={cn('flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3', fail ? 'bg-fail-solid text-fail-solid-foreground' : 'bg-pass-subtle')}>
        <div className="flex items-baseline gap-3">
          <span className={cn('text-xs font-semibold tracking-[0.06em] uppercase', fail ? 'opacity-90' : 'text-muted-foreground')}>End state</span>
          <span className={cn('status-word inline-flex items-center gap-1.5 text-2xl', !fail && 'text-pass')}>
            {fail ? <OctagonX className="size-6 self-center" strokeWidth={2} aria-hidden /> : <CircleCheck className="size-6 self-center" aria-hidden />}
            {fail ? 'Fail' : 'Pass'}
          </span>
        </div>
        <div className={cn('flex items-baseline gap-3', fail ? 'opacity-85' : 'text-muted-foreground')}>
          <span className="text-xs font-semibold tracking-[0.06em] uppercase">Reply check</span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold">
            {v.reply === null ? <CircleDashed className="size-3.5 self-center" aria-hidden /> : v.reply ? <CircleCheck className="size-3.5 self-center" aria-hidden /> : <OctagonX className="size-3.5 self-center" aria-hidden />}
            {v.reply === null ? 'not graded' : v.reply ? 'pass' : 'fail'}
          </span>
        </div>
        {v.disagree && <span className="text-sm font-semibold sm:ml-auto">A reply-only eval would have shipped this.</span>}
      </div>
      {failed.length > 0 && (
        <ul className="grid gap-x-6 gap-y-2 px-4 py-3 sm:grid-cols-2">
          {failed.map((a, i) => (
            <li key={i} className="min-w-0 text-sm">
              {a.assertion.label && <div className="font-semibold">{a.assertion.label}</div>}
              <div className="font-mono text-[13px] break-words text-muted-foreground">
                {a.expected} · got <span className="font-semibold text-fail">{a.actual}</span>
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

  if (!t && error instanceof ApiRequestError && error.status === 404) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<SearchX />}
          title="Run not found"
          action={
            <Link href="/agents" className="text-sm font-semibold text-primary hover:underline">
              Back to agents
            </Link>
          }
        >
          No run with id <span className="font-mono">{id}</span>. It may have been cleaned up by a reset.
        </EmptyState>
      </div>
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
        <Link href={back} className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden />
          {run.version !== null ? `${run.agent} v${run.version} gate board` : run.agent}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="min-w-0 text-2xl font-bold tracking-tight text-balance break-words">
            {run.scenario ? (
              <Link href={back} className="hover:underline">
                {run.scenario.includes('/') && (
                  <span className="font-normal text-muted-foreground">{run.scenario.slice(0, run.scenario.indexOf('/') + 1)}</span>
                )}
                {run.scenario.slice(run.scenario.indexOf('/') + 1)}
              </Link>
            ) : (
              'Live conversation'
            )}
          </h1>
          <span className="rounded-sm border bg-muted px-1.5 py-0.5 font-mono text-xs">{run.mode}</span>
          <OutcomePill t={t} open={open} result={result} />
        </div>
        <p className="font-mono text-xs break-all text-muted-foreground">
          {run.id} · {fmtDateTime(run.started_at)}
        </p>
        <StaleNotice error={error} onRetry={refetch} />
        {result && <VerdictStrip r={result} />}
        <Totals t={t} open={open} />
        {run.outcome === 'error' && <ErrorBanner events={t.events} />}
        {showDiff && (
          <a href="#twin-diff" className="self-start text-sm font-semibold text-primary hover:underline xl:hidden">
            Jump to twin diff
          </a>
        )}
      </header>

      <div className={cn('grid gap-6', showDiff && 'xl:grid-cols-12')}>
        <section aria-label="Timeline" className="min-w-0 xl:col-span-7">
          <h2 className="mb-3 text-lg font-semibold">Timeline</h2>
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
            <div className="mt-5 rounded-md border bg-card p-4">
              <div className="field-label mb-1">Final reply</div>
              <p className="max-w-[70ch] text-sm whitespace-pre-wrap">{run.final_reply}</p>
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
