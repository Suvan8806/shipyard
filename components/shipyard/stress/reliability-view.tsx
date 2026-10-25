'use client';
// Reliability result: one big number, then every test as a row of N pips (one per run). Inconsistent tests get a
// FLAKY tag; tests that failed every run get the solid FAILED band. Passing tests stay quiet.
import Link from 'next/link';
import { ArrowUpRight, CircleCheck, OctagonX, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtPct } from '../format';
import type { ReliabilityScenario, StressResult } from './contract';

type Verdict = 'flaky' | 'failed' | 'passed' | 'pending';

/** `total` = runs requested; a test only counts as solid / always-failed once all its runs are in. */
function verdict(s: ReliabilityScenario, total: number): Verdict {
  if (s.runs === 0) return 'pending';
  if (s.flaky || (s.passes > 0 && s.passes < s.runs)) return 'flaky';
  if (s.runs < total) return 'pending';
  if (s.passes === 0) return 'failed';
  return 'passed';
}

const ORDER: Record<Verdict, number> = { failed: 0, flaky: 1, pending: 2, passed: 3 };

function Pips({ s, total }: { s: ReliabilityScenario; total: number }) {
  return (
    <span className="flex items-center gap-1" aria-label={`${s.passes} of ${s.runs} runs passed${s.runs < total ? `, ${total - s.runs} still running` : ''}`}>
      {Array.from({ length: total }, (_, i) => {
        const state = i < s.passes ? 'pass' : i < s.runs ? 'fail' : 'pending';
        return (
          <span
            key={i}
            className={cn(
              'size-3.5 rounded-[3px] border',
              state === 'pass' && 'border-pass-border bg-pass-subtle',
              state === 'fail' && 'border-fail-solid bg-fail-solid',
              state === 'pending' && 'animate-pulse border-dashed border-running-border bg-running-subtle',
            )}
          />
        );
      })}
    </span>
  );
}

function Tag({ v }: { v: Verdict }) {
  if (v === 'flaky')
    return (
      <span className="inline-flex items-center gap-1 rounded-sm border border-warn-border bg-warn-subtle px-1.5 py-0.5 text-warn">
        <TriangleAlert className="size-3.5" strokeWidth={2} aria-hidden />
        <span className="status-word text-sm">Flaky</span>
      </span>
    );
  if (v === 'failed')
    return (
      <span className="inline-flex items-center gap-1 rounded-sm bg-fail-solid px-1.5 py-0.5 text-fail-solid-foreground">
        <OctagonX className="size-3.5" strokeWidth={2} aria-hidden />
        <span className="status-word text-sm">Failed</span>
      </span>
    );
  return null;
}

function Row({ s, total }: { s: ReliabilityScenario; total: number }) {
  const v = verdict(s, total);
  const loud = v === 'flaky' || v === 'failed';
  // Pass runs are listed first; the run after the passes is the first failing one.
  const failRun = s.passes < s.runs ? s.run_ids[s.passes] : null;
  const runHref = failRun ?? s.run_ids[0] ?? null;
  return (
    <li
      className={cn(
        'flex min-w-0 flex-col gap-2 panel px-3 py-2.5',
        v === 'flaky' && 'border-warn-border',
        v === 'failed' && 'border-fail-border',
      )}
    >
      <div className="flex items-center gap-2">
        <Pips s={s} total={total} />
        <span className="ml-auto flex items-center gap-2">
          <span className={cn('font-mono text-xs tabular-nums', loud ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
            {s.passes}/{s.runs || total}
          </span>
          <Tag v={v} />
        </span>
      </div>
      <p className={cn('min-w-0 truncate text-sm', loud ? 'font-semibold' : 'text-muted-foreground')} title={s.scenario}>
        {s.scenario}
      </p>
      {loud && runHref && (
        <Link href={`/runs/${runHref}`} className="inline-flex w-fit items-center gap-1 text-sm font-bold text-link hover:underline">
          View failing run <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </li>
  );
}

export function ReliabilityView({ r }: { r: StressResult }) {
  const rel = r.reliability;
  if (!rel) return null;
  const rows = [...rel.scenarios].sort((a, b) => ORDER[verdict(a, rel.runs)] - ORDER[verdict(b, rel.runs)] || a.scenario.localeCompare(b.scenario));
  const flaky = rel.scenarios.filter((s) => verdict(s, rel.runs) === 'flaky').length;
  const failed = rel.scenarios.filter((s) => verdict(s, rel.runs) === 'failed').length;
  const passed = rel.scenarios.filter((s) => verdict(s, rel.runs) === 'passed').length;
  const done = r.status !== 'running';
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 border-y py-4 sm:flex-row sm:items-end sm:justify-between">
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-xl font-semibold">Reliability</span>
          <span className={cn('text-5xl font-bold tabular-nums', done && flaky + failed > 0 && 'text-fail')}>
            {rel.reliability_pct === null ? '—' : fmtPct(rel.reliability_pct / 100)}
          </span>
        </p>
        <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-base">
          <span className="text-muted-foreground">
            <span className="text-2xl font-bold tabular-nums text-foreground">{rel.scenarios.length}</span> tests ×{' '}
            <span className="text-2xl font-bold tabular-nums text-foreground">{rel.runs}</span> runs
          </span>
          <span className={cn('inline-flex items-center gap-1.5', flaky ? 'text-warn' : 'text-muted-foreground')}>
            <TriangleAlert className="size-5" strokeWidth={1.75} aria-hidden />
            <span className="text-2xl font-bold tabular-nums">{flaky}</span> flaky
          </span>
          <span className={cn('inline-flex items-center gap-1.5', failed ? 'text-fail' : 'text-muted-foreground')}>
            <OctagonX className="size-5" strokeWidth={1.75} aria-hidden />
            <span className="text-2xl font-bold tabular-nums">{failed}</span> always failed
          </span>
          <span className="inline-flex items-center gap-1.5 text-pass">
            <CircleCheck className="size-5" strokeWidth={1.75} aria-hidden />
            <span className="text-2xl font-bold tabular-nums">{passed}</span> solid
          </span>
        </p>
      </div>
      {done && flaky > 0 && (
        <p className="max-w-prose text-sm text-muted-foreground">
          A flaky test passed on some runs and failed on others with the same input. One lucky deploy would have shipped it; this
          is the risk a single gate run can&apos;t see.
        </p>
      )}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
        {rows.map((s) => (
          <Row key={s.scenario} s={s} total={rel.runs} />
        ))}
      </ul>
    </div>
  );
}
