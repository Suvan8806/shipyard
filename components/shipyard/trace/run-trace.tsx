'use client';
import Link from 'next/link';
import { ArrowLeft, Brain, ChevronRight, Hand, OctagonX, TriangleAlert, Wrench } from 'lucide-react';
import type { RunEvent } from '@/lib/types';
import { cn } from '@/lib/utils';
import { getRun } from '../api';
import { fmtCost, fmtDateTime, fmtDuration } from '../format';
import { useData } from '../use-data';
import { TwinDiffPanel } from './twin-diff';

const EVENT_STYLE: Record<RunEvent['type'], { Icon: typeof Brain; cls: string; label: string }> = {
  model_call: { Icon: Brain, cls: 'sy-pill-grey', label: 'model' },
  tool_call: { Icon: Wrench, cls: 'sy-pill-green', label: 'tool' },
  policy_block: { Icon: OctagonX, cls: 'sy-pill-red', label: 'policy block' },
  approval: { Icon: Hand, cls: 'sy-pill-amber', label: 'approval' },
  error: { Icon: TriangleAlert, cls: 'sy-pill-red', label: 'error' },
};

function Json({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="group rounded-lg bg-muted/50">
      <summary className="flex cursor-pointer list-none items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground">
        <ChevronRight className="size-3 transition-transform group-open:rotate-90" /> {label}
      </summary>
      <pre className="overflow-x-auto px-3 pb-2 font-mono text-[11px] leading-relaxed">{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

function EventItem({ e }: { e: RunEvent }) {
  const s = EVENT_STYLE[e.type];
  const p = (e.payload ?? {}) as Record<string, unknown>;
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <span className={cn('z-10 grid size-8 shrink-0 place-items-center rounded-full border', s.cls)}>
        <s.Icon className="size-4" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</span>
          {e.name && <span className="font-mono text-sm font-medium">{e.name}</span>}
          <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">
            {e.latency_ms !== null && `${e.latency_ms}ms`}
            {e.tokens_in !== null && ` · ${e.tokens_in}→${e.tokens_out} tok`}
            {e.cost_usd !== null && ` · ${fmtCost(e.cost_usd)}`}
          </span>
        </div>
        {e.type === 'policy_block' && (
          <p className="sy-pill-red rounded-lg border px-2 py-1 text-sm font-medium">
            Blocked by <span className="font-mono">{String(p.policy)}</span>: {String(p.reason)}
          </p>
        )}
        {e.type === 'approval' && (
          <p className="sy-pill-amber rounded-lg border px-2 py-1 text-sm">Sent for human approval (#{String(p.approval_id)})</p>
        )}
        {e.type === 'error' && <p className="sy-text-red text-sm">{String(p.message)}</p>}
        {e.type === 'model_call' && typeof p.text === 'string' && <p className="rounded-lg border bg-card px-2 py-1.5 text-sm">{p.text}</p>}
        {e.type === 'model_call' && Array.isArray(p.tool_calls) && p.tool_calls.length > 0 && (
          <p className="text-xs text-muted-foreground">
            calls <span className="font-mono">{(p.tool_calls as string[]).join(', ')}</span>
          </p>
        )}
        {'args' in p && <Json label="args" value={p.args} />}
        {'result' in p && <Json label="result" value={p.result} />}
      </div>
    </li>
  );
}

export function RunTraceView({ id }: { id: string }) {
  const { data: t, error } = useData(`run:${id}`, () => getRun(id));
  if (error) return <p className="sy-pill-red rounded-xl border p-4">Could not load run {id}: {error.message}</p>;
  if (!t) return <div className="mx-auto h-96 max-w-7xl animate-pulse rounded-2xl bg-muted" />;
  const { run } = t;
  const dur = run.ended_at ? Date.parse(run.ended_at) - Date.parse(run.started_at) : null;
  const showDiff = run.mode === 'scenario' && t.diff !== null;
  const blocks = t.events.filter((e) => e.type === 'policy_block').length;
  const totals = [
    { label: 'Cost', value: fmtCost(run.cost_usd) },
    { label: 'Tokens', value: `${run.tokens_in.toLocaleString()} → ${run.tokens_out.toLocaleString()}` },
    { label: 'Duration', value: dur === null ? 'running' : fmtDuration(dur) },
    { label: 'Events', value: `${t.events.length}${blocks ? ` · ${blocks} blocked` : ''}` },
  ];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          href={run.version ? `/agents/${run.agent}/versions/${run.version}` : `/agents/${run.agent}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {run.agent}
          {run.version ? ` v${run.version}` : ''}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {run.scenario ? <span className="font-mono">{run.scenario}</span> : 'Live conversation'}
          </h1>
          <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase', run.mode === 'scenario' ? 'sy-pill-amber' : 'sy-pill-grey')}>
            {run.mode === 'scenario' ? 'twin run' : 'live'}
          </span>
          {run.outcome === 'error' && <span className="sy-pill-red rounded-full border px-2.5 py-0.5 text-xs font-semibold">error</span>}
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {run.id} · {fmtDateTime(run.started_at)}
        </p>
        <div className="grid grid-cols-2 gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-4">
          {totals.map((x) => (
            <div key={x.label}>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{x.label}</div>
              <div className="font-mono text-lg font-semibold tabular-nums">{x.value}</div>
            </div>
          ))}
        </div>
      </header>
      <div className={cn('grid gap-6', showDiff && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]')}>
        <section aria-label="Timeline" className="min-w-0">
          <h2 className="mb-3 text-base font-semibold">Timeline</h2>
          <ol className="relative before:absolute before:top-2 before:bottom-2 before:left-4 before:w-px before:bg-border">
            {t.events.map((e) => (
              <EventItem key={e.seq} e={e} />
            ))}
          </ol>
          {run.final_reply && (
            <div className="mt-5 rounded-xl border bg-muted/40 p-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Final reply</div>
              <p className="text-sm">{run.final_reply}</p>
            </div>
          )}
        </section>
        {showDiff && (
          <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">
            <TwinDiffPanel diff={t.diff!} before={t.before_snapshot} after={t.after_snapshot} />
          </div>
        )}
      </div>
    </div>
  );
}
