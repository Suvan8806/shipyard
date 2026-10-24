'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Loader2, X, AlertTriangle } from 'lucide-react';
import type { ScenarioResultSummary } from '@/lib/types';
import { cn } from '@/lib/utils';
import { MiniDiff } from './mini-diff';

export interface Verdicts {
  reply: boolean | null;
  endState: boolean | null;
  /** Reply check passed but the data is wrong. The whole pitch in one boolean. */
  disagree: boolean;
}

export function verdicts(r: ScenarioResultSummary): Verdicts {
  if (r.status === 'running') return { reply: null, endState: null, disagree: false };
  const reply = r.reply_check ? r.reply_check.passed : null;
  const endState = r.status === 'error' ? false : r.assertions.every((a) => a.passed);
  return { reply, endState, disagree: reply === true && endState === false };
}

export function shortName(r: ScenarioResultSummary): string {
  return r.pack && r.scenario.startsWith(`${r.pack}/`) ? r.scenario.slice(r.pack.length + 1) : r.scenario;
}

function Verdict({ label, ok, prominent }: { label: string; ok: boolean | null; prominent?: boolean }) {
  if (ok === null) {
    return (
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>—</span>
      </div>
    );
  }
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2',
        prominent ? 'text-sm font-semibold' : 'text-xs text-muted-foreground',
      )}
    >
      <span>{label}</span>
      <span className={cn('inline-flex items-center gap-1 font-mono', prominent && (ok ? 'sy-text-green' : 'sy-text-red'))}>
        {ok ? 'PASS' : 'FAIL'}
        {ok ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
      </span>
    </div>
  );
}

/** Tracks the running -> settled transition so the card flips exactly once. */
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

export function GateCard({ r }: { r: ScenarioResultSummary }) {
  const flip = useSettledFlip(r.status);
  const v = verdicts(r);
  const failed = r.assertions.filter((a) => !a.passed);
  const running = r.status === 'running';
  return (
    <article
      data-status={r.status}
      data-settled={flip ? 'true' : 'false'}
      className={cn('sy-card relative flex flex-col gap-2 overflow-hidden rounded-xl border bg-card p-3', running && 'sy-shimmer')}
    >
      <header className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 truncate font-mono text-sm font-medium" title={r.scenario}>
          {shortName(r)}
        </h3>
        {running ? (
          <Loader2 className="sy-text-amber size-4 shrink-0 animate-spin" aria-label="running" />
        ) : r.status === 'passed' ? (
          <Check className="sy-text-green size-5 shrink-0" aria-label="passed" />
        ) : (
          <X className="sy-text-red size-5 shrink-0" aria-label={r.status} />
        )}
      </header>

      {running ? (
        <p className="text-xs text-muted-foreground">Running on a fresh twin…</p>
      ) : (
        <>
          <div className="space-y-1">
            <Verdict label="Reply check" ok={v.reply} />
            <Verdict label="End state" ok={v.endState} prominent />
          </div>
          {v.disagree && (
            <p className="sy-pill-red flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold">
              <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
              A reply-only eval would have shipped this.
            </p>
          )}
          {failed.length > 0 && (
            <ul className="space-y-1">
              {failed.map((a, i) => (
                <li key={i} className="rounded-md bg-muted/60 p-1.5 font-mono text-[11px] leading-snug">
                  {a.assertion.label && (
                    <div className="mb-0.5 font-sans text-xs font-semibold">
                      {a.critical && <span className="sy-text-red">CRITICAL · </span>}
                      {a.assertion.label}
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">expected </span>
                    {a.expected}
                  </div>
                  <div>
                    <span className="text-muted-foreground">actual </span>
                    <span className="sy-text-red font-semibold">{a.actual}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {failed.length > 0 && <MiniDiff diff={r.diff} max={3} />}
          {r.run_id && (
            <Link
              href={`/runs/${r.run_id}`}
              className="mt-auto inline-flex items-center gap-1 self-start text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              View run <ArrowUpRight className="size-3" aria-hidden />
            </Link>
          )}
        </>
      )}
    </article>
  );
}
