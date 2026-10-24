'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Activity, Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getRuns, simulateTraffic } from '../api';
import { fmtCost, fmtRelative } from '../format';
import { useData, useNow } from '../use-data';

/** Fires N simulated live conversations through the agents (POST /api/admin/simulate). */
export function SimulateTrafficButton({ count = 5, onDone }: { count?: number; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await simulateTraffic(count);
      toast.success(`${r.runs} live conversations · ${fmtCost(r.cost_usd)}`, {
        description: `${r.policy_blocks} policy block${r.policy_blocks === 1 ? '' : 's'} · ${r.approvals} approval${r.approvals === 1 ? '' : 's'} requested`,
      });
      onDone?.();
      window.dispatchEvent(new Event('shipyard:runs-changed'));
    } catch (e) {
      toast.error('Simulation failed', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" onClick={run} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <Zap />}
      {busy ? 'Simulating…' : 'Simulate traffic'}
    </Button>
  );
}

/** Recent runs across all agents, newest first. Polls every 3 s. */
export function ActivityFeed({ agent, limit = 8, className }: { agent?: string; limit?: number; className?: string }) {
  const { data, loading } = useData(`runs:${agent ?? '*'}:${limit}`, () => getRuns({ limit, agent }), { pollMs: 3000 });
  const now = useNow(15000);
  return (
    <section className={cn('rounded-xl border bg-card', className)} aria-label="Recent activity">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="size-4 text-muted-foreground" aria-hidden /> Recent activity
        </h2>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="sy-pulse-dot size-1.5 rounded-full" style={{ background: 'var(--sy-green)' }} aria-hidden />
          live
        </span>
      </header>
      <ul className="divide-y">
        {loading && !data
          ? Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="px-4 py-3">
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              </li>
            ))
          : (data ?? []).map((r) => (
              <li key={r.id} className="sy-row-in">
                <Link href={`/runs/${r.id}`} className="block px-4 py-2.5 hover:bg-muted/50">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-foreground">{r.agent}</span>
                    {r.version !== null && <span className="text-muted-foreground">v{r.version}</span>}
                    <span
                      className={cn(
                        'rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide',
                        r.mode === 'scenario' ? 'sy-pill-amber' : 'sy-pill-grey',
                      )}
                    >
                      {r.mode === 'scenario' ? 'twin' : 'live'}
                    </span>
                    {r.outcome === 'error' && <span className="sy-text-red font-semibold">error</span>}
                    <span className="ml-auto tabular-nums text-muted-foreground">{fmtRelative(r.started_at, now)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                    {r.scenario ? <span className="font-mono text-xs">{r.scenario} · </span> : null}
                    {r.preview ?? '(no reply)'}
                  </p>
                  <span className="font-mono text-[11px] text-muted-foreground">{fmtCost(r.cost_usd)}</span>
                </Link>
              </li>
            ))}
        {data && data.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">No runs yet.</li>}
      </ul>
    </section>
  );
}
