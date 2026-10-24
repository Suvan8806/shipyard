'use client';
// Run timeline (design/direction.md 7.2): a vertical line with a 24px station mark per event, content to the right,
// latency + cost right-aligned in mono so they scan as a column. Payloads are untrusted shapes: render defensively.
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

const MARKS: Record<string, { Icon: typeof Wrench; mark: string; label: string }> = {
  model_call: { Icon: MessageSquareText, mark: 'bg-card border-border text-muted-foreground', label: 'Model' },
  tool_call: { Icon: Wrench, mark: 'bg-accent border-primary text-primary', label: 'Tool' },
  policy_block: { Icon: ShieldX, mark: 'bg-fail-solid border-fail-solid text-fail-solid-foreground', label: 'Policy block' },
  approval: { Icon: UserCheck, mark: 'bg-running-solid border-running-solid text-running-solid-foreground', label: 'Approval' },
  error: { Icon: TriangleAlert, mark: 'bg-warn-solid border-warn-solid text-warn-solid-foreground', label: 'Error' },
};
const UNKNOWN_MARK = { Icon: Circle, mark: 'bg-card border-border text-muted-foreground', label: 'Event' };

function fmtOffset(ts: string, startedAt: string): string {
  const ms = Date.parse(ts) - Date.parse(startedAt);
  if (!Number.isFinite(ms)) return '';
  return `+${(Math.max(0, ms) / 1000).toFixed(2)}s`;
}

function Meta({ e }: { e: RunEvent }) {
  const parts: string[] = [];
  if (e.tokens_in !== null || e.tokens_out !== null) parts.push(`${e.tokens_in ?? 0} in / ${e.tokens_out ?? 0} out`);
  if (e.latency_ms !== null) parts.push(`${e.latency_ms.toLocaleString()} ms`);
  if (e.cost_usd !== null) parts.push(fmtCost(e.cost_usd));
  if (parts.length === 0) return null;
  return <span className="font-mono text-xs text-muted-foreground tabular-nums sm:ml-auto sm:text-right">{parts.join(' · ')}</span>;
}

function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground', className)}>
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
      {text && <p className="max-w-[70ch] rounded-md border bg-card px-3 py-2 text-sm whitespace-pre-wrap">{text}</p>}
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
              <Link href="/approvals" className="font-mono text-primary hover:underline">
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

function EventItem({ e, startedAt }: { e: RunEvent; startedAt: string }) {
  const s = MARKS[e.type] ?? { ...UNKNOWN_MARK, label: String(e.type || 'Event') };
  const p = asObject(e.payload);
  const writes = e.type === 'tool_call' && e.name ? WRITES[e.name] : undefined;
  const model = e.type === 'model_call' ? (typeof p?.model === 'string' ? p.model : e.name) : null;
  const title = e.type === 'model_call' ? model : e.name === 'run' || e.name === 'rate_limit' ? null : e.name;

  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <span className={cn('z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border', s.mark)}>
        <s.Icon className="size-3.5" strokeWidth={2} aria-hidden />
      </span>
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col gap-2',
          e.type === 'policy_block' && 'rounded-md border border-fail-border bg-fail-subtle p-3',
        )}
      >
        <div className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{fmtOffset(e.ts, startedAt)}</span>
            <span className="field-label">{s.label}</span>
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
        <EventBody e={e} p={p} />
      </div>
    </li>
  );
}

export function Timeline({ events, startedAt }: { events: RunEvent[]; startedAt: string }) {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  return (
    <ol className="relative before:absolute before:top-3 before:bottom-3 before:left-[11px] before:w-0.5 before:bg-border">
      {sorted.map((e) => (
        <EventItem key={e.seq} e={e} startedAt={startedAt} />
      ))}
    </ol>
  );
}
