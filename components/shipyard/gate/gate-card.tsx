'use client';
// A test row on the departures board: quiet when passed, loud when failed, a cyan RUNNING flap while under test,
// a delay-orange ERROR for infrastructure errors (the run itself broke; that is not a FAIL verdict). The status
// flap cascades to its verdict when the result lands.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, CircleCheck, CircleDashed, OctagonX, TriangleAlert } from 'lucide-react';
import type { ScenarioResultSummary } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { getRun } from '../api';
import { Flap, type FlapTone } from '../flap';
import { MiniDiff } from './mini-diff';
import { shortName, verdicts } from './gate-model';

export { shortName, verdicts } from './gate-model';

/** How long a freshly landed row keeps its arrival wash (matches `.row-arrive` in app/globals.css). */
const FLIP_MS = 1400;
/** The RUNNING face is held for one frame so the status flap cascades from it to the verdict. */
const FLIP_SWAP_MS = 30;

/**
 * Marks a row as freshly landed exactly once per running -> verdict transition (never on a cold load of a finished
 * gate), so the row washes in while its status flap cascades from RUNNING to the verdict. Reduced motion: no wash,
 * and the flap settles instantly.
 */
function useSettledFlip(status: ScenarioResultSummary['status']): { flip: boolean; shown: ScenarioResultSummary['status'] } {
  const prev = useRef(status);
  // `held` is the face still showing mid-flip (null = show the live status). All state changes happen in timers.
  const [held, setHeld] = useState<ScenarioResultSummary['status'] | null>(null);
  const [flip, setFlip] = useState(false);
  useEffect(() => {
    const from = prev.current;
    prev.current = status;
    if (from !== 'running' || status === 'running') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const start = setTimeout(() => {
      setHeld('running');
      setFlip(true);
    }, 0);
    const swap = setTimeout(() => setHeld(null), FLIP_SWAP_MS);
    const done = setTimeout(() => setFlip(false), FLIP_MS + 40);
    return () => {
      clearTimeout(start);
      clearTimeout(swap);
      clearTimeout(done);
    };
  }, [status]);
  return { flip, shown: held ?? status };
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

const STATUS_FLAP: Record<ScenarioResultSummary['status'], { text: string; tone: FlapTone }> = {
  running: { text: 'Running', tone: 'running' },
  passed: { text: 'Passed', tone: 'pass' },
  failed: { text: 'Failed', tone: 'fail' },
  error: { text: 'Error', tone: 'warn' },
};

function StatusFlap({ status }: { status: ScenarioResultSummary['status'] }) {
  const f = STATUS_FLAP[status] ?? STATUS_FLAP.running;
  // Padded to one width so the column stays put while letters cascade.
  return <Flap text={f.text.padEnd(7, ' ')} label={f.text} tone={f.tone} className="text-[0.95rem]" />;
}

function VerdictWord({ ok, big }: { ok: boolean; big?: boolean }) {
  const Icon = ok ? CircleCheck : OctagonX;
  return (
    <span className={cn('inline-flex items-center gap-1', ok ? 'text-pass' : 'text-fail', big ? 'status-word text-xl' : 'text-sm font-bold')}>
      <Icon className={big ? 'size-5' : 'size-3.5'} strokeWidth={big ? 2.25 : 2} aria-hidden />
      {ok ? 'Pass' : 'Fail'}
    </span>
  );
}

/** The two verdict columns of a row: reply check (quiet) and end state (the one that decides). */
function VerdictCells({ r }: { r: ScenarioResultSummary }) {
  const v = verdicts(r);
  if (r.status === 'running') {
    return (
      <>
        <span className="text-sm text-muted-foreground">grading…</span>
        <span className="text-sm text-muted-foreground">on its twin</span>
      </>
    );
  }
  if (r.status === 'error') {
    return (
      <>
        <span className="text-sm text-muted-foreground">not graded</span>
        <span className="inline-flex items-center gap-1 text-sm font-bold text-warn">
          <TriangleAlert className="size-3.5" aria-hidden /> No verdict
        </span>
      </>
    );
  }
  return (
    <>
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="md:sr-only">Reply</span>
        {v.reply === null ? 'not graded' : v.reply ? (
          <span className="inline-flex items-center gap-1"><CircleCheck className="size-3.5" aria-hidden /> Pass</span>
        ) : (
          <span className={cn('inline-flex items-center gap-1 font-bold', r.status === 'failed' ? 'text-fail' : 'text-warn')}>
            <OctagonX className="size-3.5" aria-hidden /> {r.status === 'failed' ? 'Fail' : 'Flagged'}
          </span>
        )}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="text-sm text-muted-foreground md:sr-only">End state</span>
        <VerdictWord ok={v.endState ?? r.status === 'passed'} big={r.status === 'failed'} />
      </span>
    </>
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
          <button type="button" className="text-xs font-bold text-link underline-offset-4 hover:underline" onClick={() => setAll(true)}>
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
    <Link href={`/runs/${runId}`} className="inline-flex items-center gap-1 self-start text-sm font-bold text-link underline-offset-4 hover:underline">
      {label} <ArrowUpRight className="size-3.5" aria-hidden />
    </Link>
  );
}

function ErrorBody({ r }: { r: ScenarioResultSummary }) {
  const [open, setOpen] = useState(false);
  const { message, loading } = useRunError(r.run_id, open);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`The run broke before grading, not a FAIL. ${open ? 'Hide' : 'Show'} the error for ${shortName(r)}`}
        className="flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground"
      >
        The run broke before grading · not a FAIL
        <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="flex flex-col gap-2">
          {loading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            // Clamp lives on the inner span so the padding box never shows a sliver of the next line.
            <p className="rounded-sm bg-muted px-2 py-1.5 font-mono text-xs text-foreground" title={message ?? undefined}>
              <span className="line-clamp-3 break-words">{message ?? 'No error message was recorded for this run.'}</span>
            </p>
          )}
          <RunLink runId={r.run_id} />
        </div>
      )}
    </>
  );
}

function FailedBody({ r }: { r: ScenarioResultSummary }) {
  const v = verdicts(r);
  return (
    <>
      {/* The proof under a failed row: what the data should have been, what the twin holds, and the reply that fooled the judge. */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="field-label">End state · what the twin holds</span>
          <FailedAssertions r={r} />
          <MiniDiff diff={r.diff} max={3} />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <span className="field-label">Reply check {v.reply === null ? '· not graded' : v.reply ? '· pass' : '· fail'}</span>
          {r.final_reply && <p className="line-clamp-2 text-sm text-muted-foreground">&ldquo;{r.final_reply}&rdquo;</p>}
          {v.disagree && (
            <p className="flex items-center gap-1.5 rounded-sm bg-fail-solid px-3 py-2 text-sm font-bold text-fail-solid-foreground">
              <OctagonX className="size-4 shrink-0" strokeWidth={2.25} aria-hidden />
              A reply-only eval would have shipped this.
            </p>
          )}
          <RunLink runId={r.run_id} label="Open run trace" />
        </div>
      </div>
    </>
  );
}

function PassedBody({ r }: { r: ScenarioResultSummary }) {
  const [open, setOpen] = useState(false);
  const v = verdicts(r);
  // The end state decides the verdict. A flagged reply on a passed test is a note, not a FAIL: say so neutrally.
  const flagged = v.reply === false;
  const summary = flagged
    ? 'Reply check: flagged · data correct'
    : `End state ${v.endState ? 'pass' : '—'} · Reply ${v.reply === null ? 'not graded' : 'pass'}`;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${summary}. ${open ? 'Hide' : 'Show'} details for ${shortName(r)}`}
        title={flagged ? r.reply_check?.rationale : undefined}
        className="flex items-center gap-1 self-start text-left text-xs text-muted-foreground hover:text-foreground"
      >
        {summary}
        <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="flex flex-col gap-2">
          {flagged && r.reply_check?.rationale && (
            <p className="rounded-sm bg-muted px-2 py-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Reply judge: </span>
              {r.reply_check.rationale}
            </p>
          )}
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

export function GateCard({ r: result, code }: { r: ScenarioResultSummary; code: string }) {
  const { flip, shown } = useSettledFlip(result.status);
  const r: ScenarioResultSummary = shown === result.status ? result : { ...result, status: shown };
  const id = `tag-${r.scenario.replace(/[^a-z0-9-]/gi, '-')}`;
  const crit = r.status === 'failed' && r.assertions.some((a) => !a.passed && a.critical);
  return (
    <article
      aria-labelledby={id}
      data-status={r.status}
      className={cn(
        'border-b last:border-b-0',
        r.status === 'failed' && 'bg-fail-subtle',
        r.status === 'running' && 'running-sheen animate-running-sheen',
        flip && 'row-arrive',
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 px-3 py-2.5 sm:px-4 md:grid-cols-[7.4rem_4.25rem_minmax(0,1fr)_7.5rem_8.5rem]">
        <StatusFlap status={r.status} />
        <span className="hidden font-mono text-xs text-muted-foreground md:block">{code}</span>
        <div className="flex min-w-0 items-center gap-2">
          <h3 id={id} className={cn('truncate text-[0.9375rem] leading-tight', r.status === 'failed' ? 'font-bold' : 'font-semibold')} title={r.scenario}>
            {shortName(r)}
          </h3>
          {crit && (
            <span className="status-word inline-flex shrink-0 items-center gap-1 rounded-sm bg-fail-solid px-1.5 py-1 text-xs text-fail-solid-foreground">
              <TriangleAlert className="size-3" strokeWidth={2.25} aria-hidden /> Critical
            </span>
          )}
        </div>
        <div className="col-start-2 flex flex-wrap items-center gap-x-5 gap-y-1 md:contents">
          <VerdictCells r={r} />
        </div>
      </div>
      {r.status !== 'running' && (
        <div
          className={cn(
            'flex flex-col gap-2.5 px-3 sm:px-4 md:pl-[14.65rem]',
            r.status === 'failed' ? 'pb-4' : '-mt-1.5 pb-2.5',
          )}
        >
          {r.status === 'error' && <ErrorBody r={r} />}
          {r.status === 'failed' && <FailedBody r={r} />}
          {r.status === 'passed' && <PassedBody r={r} />}
        </div>
      )}
    </article>
  );
}
