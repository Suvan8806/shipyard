'use client';
// The scenario tag (design/direction.md 7.1): quiet when passed, loud when failed, amber band while under test,
// warn band for infrastructure errors (the run itself broke; that is not a FAIL verdict).
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, CircleCheck, CircleDashed, OctagonX, TriangleAlert } from 'lucide-react';
import type { ScenarioResultSummary } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { getRun } from '../api';
import { MiniDiff } from './mini-diff';
import { shortName, verdicts } from './gate-model';

export { shortName, verdicts } from './gate-model';

/** Plays the flip exactly once per running -> verdict transition (never on a cold load of a finished gate). */
function useSettledFlip(status: ScenarioResultSummary['status']): boolean {
  const prev = useRef(status);
  const [flip, setFlip] = useState(false);
  useEffect(() => {
    if (prev.current === 'running' && status !== 'running') {
      setFlip(true);
      const t = setTimeout(() => setFlip(false), 700);
      prev.current = status;
      return () => clearTimeout(t);
    }
    prev.current = status;
  }, [status]);
  return flip;
}

// Error results carry no message; the run trace's `error` event has it. Cached per run id for the page lifetime.
const errorCache = new Map<string, Promise<string | null>>();
function loadRunError(runId: string): Promise<string | null> {
  let p = errorCache.get(runId);
  if (!p) {
    p = getRun(runId)
      .then((t) => {
        const ev = [...t.events].reverse().find((e) => e.type === 'error');
        const payload = ev?.payload as { error?: unknown; message?: unknown } | null | undefined;
        const msg = payload?.error ?? payload?.message ?? (typeof ev?.payload === 'string' ? ev.payload : null);
        return msg ? String(msg) : null;
      })
      .catch(() => {
        errorCache.delete(runId);
        return null;
      });
    errorCache.set(runId, p);
  }
  return p;
}

function useRunError(runId: string | null, enabled: boolean): { message: string | null; loading: boolean } {
  const [state, setState] = useState<{ id: string | null; message: string | null }>({ id: null, message: null });
  useEffect(() => {
    if (!enabled || !runId) return;
    let live = true;
    void loadRunError(runId).then((m) => live && setState({ id: runId, message: m }));
    return () => {
      live = false;
    };
  }, [runId, enabled]);
  return { message: state.id === runId ? state.message : null, loading: enabled && !!runId && state.id !== runId };
}

function Eyelet({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('grid size-[22px] shrink-0 place-items-center rounded-full border-[1.5px] border-current/60', className)}>
      {children}
    </span>
  );
}

function Band({ r, code }: { r: ScenarioResultSummary; code: string }) {
  const crit = r.status === 'failed' && r.assertions.some((a) => !a.passed && a.critical);
  const meta = (
    <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px]">
      {crit && (
        <span className="inline-flex items-center gap-0.5 font-sans font-semibold">
          <TriangleAlert className="size-3" strokeWidth={2} aria-hidden /> Critical
        </span>
      )}
      {code}
    </span>
  );
  if (r.status === 'failed') {
    return (
      <div className="flex items-center gap-2 bg-fail-solid px-3 py-2 text-fail-solid-foreground">
        <Eyelet><OctagonX className="size-3.5" strokeWidth={2} aria-hidden /></Eyelet>
        <span className="status-word text-xl">Failed</span>
        {meta}
      </div>
    );
  }
  if (r.status === 'running') {
    return (
      <div className="running-sheen flex animate-running-sheen items-center gap-2 bg-running-solid px-3 py-2 text-running-solid-foreground">
        <Eyelet><CircleDashed className="size-3.5 animate-running-ring" strokeWidth={2} aria-hidden /></Eyelet>
        <span className="status-word text-base">Under test</span>
        {meta}
      </div>
    );
  }
  if (r.status === 'error') {
    return (
      <div className="flex items-center gap-2 border-b border-warn-border bg-warn-subtle px-3 py-2 text-warn">
        <Eyelet><TriangleAlert className="size-3.5" strokeWidth={2} aria-hidden /></Eyelet>
        <span className="status-word text-base">Error</span>
        {meta}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-3 pt-2.5 text-pass">
      <CircleCheck className="size-4" strokeWidth={1.75} aria-hidden />
      <span className="status-word text-sm">Passed</span>
      <span className="ml-auto font-mono text-[11px] text-muted-foreground">{code}</span>
    </div>
  );
}

function VerdictWord({ ok, big }: { ok: boolean; big?: boolean }) {
  const Icon = ok ? CircleCheck : OctagonX;
  return (
    <span className={cn('inline-flex items-center gap-1', ok ? 'text-pass' : 'text-fail', big ? 'status-word text-xl' : 'text-sm font-semibold')}>
      <Icon className={big ? 'size-5' : 'size-3.5'} strokeWidth={big ? 1.75 : 2} aria-hidden />
      {ok ? 'Pass' : 'Fail'}
    </span>
  );
}

function FailedAssertions({ r }: { r: ScenarioResultSummary }) {
  const [all, setAll] = useState(false);
  const failed = r.assertions.filter((a) => !a.passed);
  const shown = all ? failed : failed.slice(0, 3);
  return (
    <ul className="space-y-1.5">
      {shown.map((a, i) => (
        <li key={i} className="text-sm">
          {a.assertion.label && <div className="font-medium">{a.assertion.label}</div>}
          <div className="font-mono text-[13px] leading-snug text-muted-foreground">
            {a.expected} · got <span className="font-semibold text-fail">{a.actual}</span>
          </div>
        </li>
      ))}
      {failed.length > 3 && !all && (
        <li>
          <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setAll(true)}>
            +{failed.length - 3} more
          </button>
        </li>
      )}
    </ul>
  );
}

function RunLink({ runId, label = 'View run' }: { runId: string | null; label?: string }) {
  if (!runId) return null;
  return (
    <Link href={`/runs/${runId}`} className="mt-auto inline-flex items-center gap-1 self-end text-sm font-medium text-primary hover:underline">
      {label} <ArrowUpRight className="size-3.5" aria-hidden />
    </Link>
  );
}

function ErrorBody({ r }: { r: ScenarioResultSummary }) {
  const { message, loading } = useRunError(r.run_id, true);
  return (
    <>
      <p className="text-sm font-medium">Infrastructure error, not a test failure.</p>
      <p className="text-xs text-muted-foreground">The run broke before it could be graded, so its checks don&apos;t count as a FAIL.</p>
      {loading ? (
        <Skeleton className="h-10 w-full" />
      ) : (
        <p
          className="line-clamp-3 break-words rounded-sm bg-muted px-2 py-1.5 font-mono text-xs text-foreground"
          title={message ?? undefined}
        >
          {message ?? 'No error message was recorded for this run.'}
        </p>
      )}
      <RunLink runId={r.run_id} />
    </>
  );
}

function FailedBody({ r }: { r: ScenarioResultSummary }) {
  const v = verdicts(r);
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="field-label">End state</span>
        <VerdictWord ok={v.endState ?? false} big />
      </div>
      <FailedAssertions r={r} />
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span className="field-label">Reply check</span>
        {v.reply === null ? <span className="text-sm">not graded</span> : <VerdictWord ok={v.reply} />}
      </div>
      {r.final_reply && <p className="line-clamp-1 text-sm text-muted-foreground">&ldquo;{r.final_reply}&rdquo;</p>}
      {v.disagree && (
        <p className="flex items-center gap-1.5 rounded-md border border-fail-border bg-fail-subtle px-3 py-2 text-sm font-semibold text-fail">
          <OctagonX className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
          A reply-only eval would have shipped this.
        </p>
      )}
      <MiniDiff diff={r.diff} max={2} />
      <RunLink runId={r.run_id} />
    </>
  );
}

function PassedBody({ r }: { r: ScenarioResultSummary }) {
  const [open, setOpen] = useState(false);
  const v = verdicts(r);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground"
      >
        End state {v.endState ? 'pass' : '—'} · Reply {v.reply === null ? 'not graded' : v.reply ? 'pass' : 'fail'}
        <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="flex flex-col gap-2">
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {r.assertions.map((a, i) => (
              <li key={i} className="flex gap-1">
                <CircleCheck className="mt-0.5 size-3 shrink-0 text-pass" strokeWidth={2} aria-hidden />
                <span>{a.assertion.label ?? a.expected}</span>
              </li>
            ))}
          </ul>
          {r.final_reply && <p className="line-clamp-2 text-xs text-muted-foreground">&ldquo;{r.final_reply}&rdquo;</p>}
          <RunLink runId={r.run_id} />
        </div>
      )}
    </>
  );
}

export function GateCard({ r, code }: { r: ScenarioResultSummary; code: string }) {
  const flip = useSettledFlip(r.status);
  const id = `tag-${r.scenario.replace(/[^a-z0-9-]/gi, '-')}`;
  return (
    <article
      aria-labelledby={id}
      data-status={r.status}
      className={cn(
        'flex flex-col overflow-hidden rounded-md border bg-card',
        r.status === 'failed' && 'border-fail-border xl:col-span-2',
        r.status === 'error' && 'border-warn-border',
        flip && 'animate-tag-flip',
      )}
    >
      <Band r={r} code={code} />
      <div className={cn('flex flex-1 flex-col gap-2.5 px-3 pb-3', r.status === 'passed' ? 'pt-1' : 'pt-2.5')}>
        <h3 id={id} className="truncate text-lg font-semibold leading-tight" title={r.scenario}>
          {shortName(r)}
        </h3>
        {r.status === 'running' && (
          <div className="flex flex-col gap-1.5" aria-hidden>
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3.5 w-1/2" />
          </div>
        )}
        {r.status === 'error' && <ErrorBody r={r} />}
        {r.status === 'failed' && <FailedBody r={r} />}
        {r.status === 'passed' && <PassedBody r={r} />}
      </div>
    </article>
  );
}
