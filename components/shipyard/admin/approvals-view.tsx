'use client';
// Approvals (design/direction.md 7.5): pending actions with Approve (primary) / Reject (outline destructive),
// optimistic with rollback + toast. Optimistic decisions live in `overrides` so a background poll that still
// sees the row as pending can't flip it back while the request is in flight.
import { useState } from 'react';
import { usePermission } from '../acting-as';
import { Check, CircleCheck, Hand, Loader2, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { Approval } from '@/lib/contracts/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { decide, errorMessage, getApprovals } from '../api';
import { fmtDateTime, fmtRelative } from '../format';
import { EmptyState, ErrorState, StaleNotice, TableSkeleton } from '../states';
import { useData } from '../use-data';
import { JsonBlock } from '../trace/json-block';

const POLL_MS = 5000;
type Decided = 'approved' | 'rejected';

function without<V>(m: Record<number, V>, id: number): Record<number, V> {
  return Object.fromEntries(Object.entries(m).filter(([k]) => Number(k) !== id));
}

function DecidedChip({ status }: { status: Decided }) {
  const ok = status === 'approved';
  const Icon = ok ? CircleCheck : XCircle;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs font-semibold',
        ok ? 'border-pass-border bg-pass-subtle text-pass' : 'bg-muted text-muted-foreground',
      )}
    >
      <Icon className="size-3" strokeWidth={2} aria-hidden /> {ok ? 'Approved' : 'Rejected'}
    </span>
  );
}

function PendingRow({
  a,
  busy,
  onDecide,
}: {
  a: Approval;
  busy: 'approve' | 'reject' | null;
  onDecide: (a: Approval, d: 'approve' | 'reject') => void;
}) {
  const perm = usePermission('approve', 'member-support');
  return (
    <li className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-start md:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-mono text-sm font-semibold">{a.type}</span>
          <span className="font-mono text-xs text-muted-foreground">
            #{a.id} · {a.account_id ?? '—'}
          </span>
          <span className="text-xs text-muted-foreground" title={fmtDateTime(a.created_at)}>
            {fmtRelative(a.created_at)}
          </span>
        </div>
        <p className="max-w-[70ch] text-sm">{a.details || 'No details provided.'}</p>
        {a.tool_args !== null && a.tool_args !== undefined && <JsonBlock label="Tool call" value={a.tool_args} preview />}
      </div>
      <div className="flex shrink-0 gap-2 md:pt-0.5">
        <Button
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={busy !== null || !perm.allowed}
          title={perm.reason ?? undefined}
          onClick={() => onDecide(a, 'reject')}
        >
          {busy === 'reject' ? <Loader2 className="animate-spin" aria-hidden /> : <X aria-hidden />} Reject
        </Button>
        <Button disabled={busy !== null || !perm.allowed} title={perm.reason ?? undefined} onClick={() => onDecide(a, 'approve')}>
          {busy === 'approve' ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />} Approve
        </Button>
      </div>
    </li>
  );
}

export function ApprovalsView() {
  const { data, error, refetch } = useData('approvals', () => getApprovals(), { pollMs: POLL_MS });
  const [overrides, setOverrides] = useState<Record<number, Decided>>({});
  const [inFlight, setInFlight] = useState<Record<number, 'approve' | 'reject'>>({});

  const all = (data ?? []).map((a) =>
    overrides[a.id] && a.status === 'pending' ? { ...a, status: overrides[a.id], decided_at: a.decided_at ?? new Date().toISOString() } : a,
  );
  // In-flight rows stay in Pending (with a spinner) until the server answers.
  const pending = all.filter((a) => a.status === 'pending' || inFlight[a.id]);
  const decided = all
    .filter((a) => a.status !== 'pending' && !inFlight[a.id])
    .sort((x, y) => Date.parse(y.decided_at ?? y.created_at) - Date.parse(x.decided_at ?? x.created_at));

  const onDecide = async (a: Approval, d: 'approve' | 'reject') => {
    if (inFlight[a.id]) return;
    const status: Decided = d === 'approve' ? 'approved' : 'rejected';
    setInFlight((m) => ({ ...m, [a.id]: d }));
    setOverrides((m) => ({ ...m, [a.id]: status }));
    const who = a.account_id ? ` for ${a.account_id}` : '';
    try {
      await decide(a.id, d);
      toast.success(d === 'approve' ? `Approved. ${a.type}${who} executed.` : `Rejected. ${a.type}${who} was not executed.`);
      void refetch();
    } catch (e) {
      setOverrides((m) => without(m, a.id));
      toast.error(`Couldn't ${d} #${a.id}`, { description: errorMessage(e) });
      void refetch();
    } finally {
      setInFlight((m) => without(m, a.id));
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Approvals</h1>
        <p className="max-w-[70ch] text-muted-foreground">
          Actions an agent may not take alone. Approving runs the exact tool call the agent proposed; rejecting changes nothing.
        </p>
        <StaleNotice error={data ? error : null} onRetry={refetch} />
      </header>

      {!data && error ? (
        <ErrorState title="Couldn't load approvals" error={error} onRetry={refetch} />
      ) : !data ? (
        <TableSkeleton rows={3} cols={3} />
      ) : (
        <>
          <section className="flex flex-col gap-3" aria-label="Pending approvals">
            <h2 className="flex items-baseline gap-2 text-xl font-semibold">
              Pending <span className="font-mono text-sm font-normal text-muted-foreground tabular-nums">{pending.length}</span>
            </h2>
            {pending.length === 0 ? (
              <EmptyState icon={<Hand />} title="No approvals waiting.">
                When an agent calls a tool that needs a human, the request lands here.
              </EmptyState>
            ) : (
              <ul className="divide-y rounded-md border bg-card">
                {pending.map((a) => (
                  <PendingRow key={a.id} a={a} busy={inFlight[a.id] ?? null} onDecide={onDecide} />
                ))}
              </ul>
            )}
          </section>

          {decided.length > 0 && (
            <section className="flex flex-col gap-3" aria-label="Decided approvals">
              <h2 className="flex items-baseline gap-2 text-xl font-semibold">
                Decided <span className="font-mono text-sm font-normal text-muted-foreground tabular-nums">{decided.length}</span>
              </h2>
              <ul className="divide-y rounded-md border bg-card">
                {decided.map((a) => (
                  <li key={a.id} className="flex flex-col gap-1 px-4 py-2.5 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <DecidedChip status={a.status as Decided} />
                      <span className="font-mono font-semibold">{a.type}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        #{a.id} · {a.account_id ?? '—'}
                      </span>
                    </div>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground" title={a.details ?? undefined}>
                      {a.details}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground sm:ml-auto">
                      {a.decided_at ? fmtDateTime(a.decided_at) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
