'use client';
// Run timeline (design/direction.md 7.2): a departures-style list of rows, one per event, each with a type chip,
// a latency bar whose length is the step's exact duration, and tokens + cost right-aligned in mono. Payloads are untrusted shapes: render defensively.
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Circle, MessageSquareText, ShieldX, TriangleAlert, UserCheck, Wrench } from 'lucide-react';
import type { RunEvent } from '@/lib/types';
import { cn } from '@/lib/utils';
import { fmtCost } from '../format';
import { JsonBlock, toJson } from './json-block';

type Payload = Record<string, unknown>;

function asObject(p: unknown): Payload | null {
  return p !== null && typeof p === 'object' && !Array.isArray(p) ? (p as Payload) : null;
}

/** Pulls a human message out of an error payload ({error}, {message}, a string, or anything else). */
export function errorText(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  const p = asObject(payload);
  if (!p) return payload === null || payload === undefined ? 'Unknown error' : toJson(payload);
  for (const k of ['error', 'message', 'reason']) {
    const v = p[k];
    if (typeof v === 'string' && v) return v;
    if (asObject(v) && typeof (v as Payload).message === 'string') return String((v as Payload).message);
  }
  return toJson(p);
}

/** Tool names -> the twin table they write, for the small "writes X" chip. */
const WRITES: Record<string, string> = {
  'accounts.apply_credit': 'credits',
  'crm.add_note': 'crm_notes',
  'payments.defer': 'deferrals',
  'email.send': 'email_outbox',
  'approval.request': 'approvals',
};

/** Event type chips: policy blocks and errors read loudly (solid), the rest stay quiet. */
const MARKS: Record<string, { Icon: typeof Wrench; mark: string; label: string; bar: string }> = {
  model_call: { Icon: MessageSquareText, mark: 'border-border bg-card text-muted-foreground', label: 'Model', bar: 'bg-chart-2' },
  tool_call: { Icon: Wrench, mark: 'border-foreground/25 bg-card text-foreground', label: 'Tool', bar: 'bg-chart-1' },
  policy_block: { Icon: ShieldX, mark: 'border-fail-solid bg-fail-solid text-fail-solid-foreground', label: 'Policy block', bar: 'bg-fail-solid' },
  approval: { Icon: UserCheck, mark: 'border-running-border bg-running-subtle text-running', label: 'Approval', bar: 'bg-chart-1' },
  error: { Icon: TriangleAlert, mark: 'border-warn-solid bg-warn-solid text-warn-solid-foreground', label: 'Error', bar: 'bg-warn-solid' },
};
const UNKNOWN_MARK = { Icon: Circle, mark: 'border-border bg-card text-muted-foreground', label: 'Event', bar: 'bg-chart-2' };

function fmtOffset(ts: string, startedAt: string): string {
  const ms = Date.parse(ts) - Date.parse(startedAt);
  if (!Number.isFinite(ms)) return '';
  return `+${(Math.max(0, ms) / 1000).toFixed(2)}s`;
}

function Meta({ e }: { e: RunEvent }) {
  const parts: string[] = [];
  if (e.tokens_in !== null || e.tokens_out !== null) parts.push(`${e.tokens_in ?? 0} in / ${e.tokens_out ?? 0} out`);
  if (e.cost_usd !== null) parts.push(fmtCost(e.cost_usd));
  if (parts.length === 0) return null;
  return <span className="font-mono text-xs break-words text-muted-foreground tabular-nums sm:ml-auto sm:text-right">{parts.join(' · ')}</span>;
}

function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex max-w-full items-center rounded-[3px] border bg-muted px-1.5 py-0.5 font-mono text-xs break-all text-foreground', className)}>
      {children}
    </span>
  );
}

function ModelBody({ p }: { p: Payload }) {
  const calls = Array.isArray(p.tool_calls) ? p.tool_calls.map((c) => (typeof c === 'string' ? c : toJson(c))) : [];
  const text = typeof p.text === 'string' && p.text.trim() ? p.text : null;
  return (
    <>
      {calls.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <span>Calls</span>
          {calls.map((c, i) => (
            <Chip key={`${c}-${i}`}>{c}</Chip>
          ))}
        </div>
      )}
      {text && <p className="max-w-[70ch] rounded-[4px] border bg-muted/40 px-3 py-2 text-sm break-words whitespace-pre-wrap">{text}</p>}
      {!text && calls.length === 0 && typeof p.finish_reason === 'string' && (
        <p className="text-sm text-muted-foreground">Finished: {p.finish_reason}</p>
      )}
    </>
  );
}

function EventBody({ e, p }: { e: RunEvent; p: Payload | null }) {
  const raw = e.payload;
  if (e.type === 'model_call') {
    return p ? <ModelBody p={p} /> : raw != null ? <JsonBlock label="Payload" value={raw} preview /> : null;
  }
  if (e.type === 'policy_block') {
    const reason = p && typeof p.reason === 'string' ? p.reason : errorText(raw);
    return (
      <>
        <p className="text-sm font-semibold text-fail">{reason}</p>
        {p && 'args' in p && <JsonBlock label="Blocked arguments" value={p.args} preview />}
      </>
    );
  }
  if (e.type === 'approval') {
    const id = p?.approval_id;
    return (
      <>
        <p className="text-sm">
          <span className="status-word text-sm">Requested</span>{' '}
          <span className="text-muted-foreground">Sent to a human for approval</span>
          {id !== undefined && id !== null && (
            <>
              {' '}
              <Link href="/approvals" className="rounded-sm font-mono text-link underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                #{String(id)}
              </Link>
            </>
          )}
        </p>
        {p && 'args' in p && <JsonBlock label="Proposed arguments" value={p.args} preview />}
      </>
    );
  }
  if (e.type === 'error') {
    return (
      <>
        <p className="font-mono text-[13px] break-words whitespace-pre-wrap text-warn">{errorText(raw)}</p>
        {p && 'args' in p && <JsonBlock label="Arguments" value={p.args} preview />}
      </>
    );
  }
  if (e.type === 'tool_call' && p && ('args' in p || 'result' in p)) {
    return (
      <>
        {'args' in p && <JsonBlock label="Arguments" value={p.args} preview />}
        {'result' in p && <JsonBlock label="Result" value={p.result} preview />}
      </>
    );
  }
  return raw === null || raw === undefined ? null : <JsonBlock label="Payload" value={raw} preview />;
}

function LatencyBar({ ms, max, bar }: { ms: number | null; max: number; bar: string }) {
  if (ms === null) return null;
  const pct = max > 0 ? Math.max(1.5, (ms / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3" title={`${ms.toLocaleString()} ms`}>
      <div className="h-1.5 min-w-0 flex-1 rounded-[2px] bg-muted" aria-hidden>
        <div className={cn('h-1.5 rounded-[2px]', bar)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-20 shrink-0 text-right font-mono text-xs font-semibold tabular-nums">{ms.toLocaleString()} ms</span>
    </div>
  );
}

function EventItem({ e, startedAt, maxLatency }: { e: RunEvent; startedAt: string; maxLatency: number }) {
  const s = MARKS[e.type] ?? { ...UNKNOWN_MARK, label: String(e.type || 'Event') };
  const p = asObject(e.payload);
  const writes = e.type === 'tool_call' && e.name ? WRITES[e.name] : undefined;
  const model = e.type === 'model_call' ? (typeof p?.model === 'string' ? p.model : e.name) : null;
  const title = e.type === 'model_call' ? model : e.name === 'run' || e.name === 'rate_limit' ? null : e.name;
  const loud = e.type === 'policy_block' || e.type === 'error';

  return (
    <li
      className={cn(
        'flex min-w-0 flex-col gap-2.5 px-4 py-3.5 sm:grid sm:grid-cols-[4.25rem_minmax(0,1fr)] sm:gap-x-4',
        e.type === 'policy_block' && 'bg-fail-subtle',
        e.type === 'error' && 'bg-warn-subtle',
      )}
    >
      <span className="pt-1 font-mono text-xs text-muted-foreground tabular-nums">{fmtOffset(e.ts, startedAt)}</span>
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={cn(
                'status-word inline-flex shrink-0 items-center gap-1 rounded-[3px] border px-1.5 py-1',
                loud ? 'text-[0.8125rem]' : 'text-xs',
                s.mark,
              )}
            >
              <s.Icon className="size-3.5" strokeWidth={2.25} aria-hidden />
              {s.label}
            </span>
            {title && (
              <span className={cn('min-w-0 font-mono text-sm break-all', e.type === 'model_call' ? 'text-muted-foreground' : 'font-semibold')}>
                {title}
              </span>
            )}
            {e.type === 'policy_block' && <Chip className="bg-card">policy</Chip>}
            {writes && <Chip>writes {writes}</Chip>}
          </div>
          <Meta e={e} />
        </div>
        <LatencyBar ms={e.latency_ms} max={maxLatency} bar={s.bar} />
        <EventBody e={e} p={p} />
      </div>
    </li>
  );
}

/** Each row carries a latency bar: length is exact duration, relative to the slowest step in the run. */
export function Timeline({ events, startedAt }: { events: RunEvent[]; startedAt: string }) {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const maxLatency = sorted.reduce((m, e) => Math.max(m, e.latency_ms ?? 0), 0);
  return (
    <ol className="panel min-w-0 divide-y overflow-hidden">
      {sorted.map((e) => (
        <EventItem key={e.seq} e={e} startedAt={startedAt} maxLatency={maxLatency} />
      ))}
    </ol>
  );
}
