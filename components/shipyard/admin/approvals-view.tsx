'use client';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Approval } from '@/lib/contracts/api';
import { Button } from '@/components/ui/button';
import { decide, getApprovals } from '../api';
import { fmtDateTime } from '../format';
import { useData } from '../use-data';

export function ApprovalsView() {
  const { data, error, setData, refetch } = useData('approvals', () => getApprovals(), { pollMs: 5000 });
  const all = data ?? [];
  const pending = all.filter((a) => a.status === 'pending');
  const decided = all.filter((a) => a.status !== 'pending');

  const act = async (a: Approval, decision: 'approve' | 'reject') => {
    const status = decision === 'approve' ? 'approved' : 'rejected';
    setData((prev) => (prev ?? []).map((x) => (x.id === a.id ? { ...x, status, decided_at: new Date().toISOString() } : x)));
    try {
      await decide(a.id, decision);
      toast.success(`${decision === 'approve' ? 'Approved' : 'Rejected'} #${a.id}`, {
        description: decision === 'approve' ? `${a.type} executed for ${a.account_id ?? 'account'}` : 'No change was made.',
      });
    } catch (e) {
      toast.error('Decision failed', { description: e instanceof Error ? e.message : String(e) });
      void refetch();
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Approvals</h1>
        <p className="text-muted-foreground">Actions an agent may not take alone. Approving runs the exact tool call the agent proposed.</p>
      </header>
      {error && <p className="sy-pill-red rounded-xl border p-4 text-sm">{error.message}</p>}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          Pending <span className="text-sm font-normal text-muted-foreground">{pending.length}</span>
        </h2>
        {data && pending.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Nothing waiting. Nice.</p>}
        {pending.map((a) => (
          <article key={a.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">{a.type}</span>
                <span className="font-mono text-xs text-muted-foreground">#{a.id} · {a.account_id}</span>
                <span className="text-xs text-muted-foreground">{fmtDateTime(a.created_at)}</span>
              </div>
              <p className="mt-1 text-sm">{a.details}</p>
              <pre className="mt-1.5 overflow-x-auto rounded-lg bg-muted/50 px-2 py-1 font-mono text-[11px]">{JSON.stringify(a.tool_args)}</pre>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => act(a, 'reject')}>
                <X /> Reject
              </Button>
              <Button onClick={() => act(a, 'approve')}>
                <Check /> Approve
              </Button>
            </div>
          </article>
        ))}
      </section>
      {decided.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Decided</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {decided.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                <span className={a.status === 'approved' ? 'sy-pill-green rounded-full border px-2 text-xs font-semibold' : 'sy-pill-red rounded-full border px-2 text-xs font-semibold'}>
                  {a.status}
                </span>
                <span className="font-mono">{a.type}</span>
                <span className="text-muted-foreground">{a.account_id}</span>
                <span className="ml-auto text-xs text-muted-foreground">{a.decided_at ? fmtDateTime(a.decided_at) : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
