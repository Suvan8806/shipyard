'use client';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { Activity, CircleDashed, Loader2, TriangleAlert, Zap } from 'lucide-react';
import { toast } from 'sonner';
import type { RunListItem } from '@/lib/contracts/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { adminToken, errorMessage, getRuns, simulateTraffic, USE_MOCKS } from '../api';
import { fmtCost, fmtRelative } from '../format';
import { EmptyState, ErrorState, Skeleton, StaleNotice } from '../states';
import { useData, useNow } from '../use-data';

export const RUNS_CHANGED_EVENT = 'shipyard:runs-changed';
const POLL_MS = 5000;
/** lib/platform/repo.ts slices run previews to this many characters. */
const PREVIEW_MAX = 140;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Fires N simulated live conversations through the agents (POST /api/admin/simulate, 10-60 s). */
export function SimulateTrafficButton({ count = 5, onDone }: { count?: number; onDone?: () => void }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const now = useNow(1000, startedAt !== null);
  const busy = startedAt !== null;
  // Read after mount (the URL isn't known during prerender); never kept beyond a boolean.
  const [hasToken, setHasToken] = useState(false);
  useEffect(() => setHasToken(adminToken() !== null), []);
  const run = async () => {
    if (busy) return;
    setStartedAt(Date.now());
    try {
      const r = await simulateTraffic(count);
      toast.success(
        `${plural(r.runs, 'run')} · ${plural(r.policy_blocks, 'policy block')} · ${plural(r.approvals, 'approval')} · ${fmtCost(r.cost_usd)}`,
        { description: 'Simulated member conversations ran against the live versions.' },
      );
    } catch (e) {
      toast.error('Simulation failed', { description: errorMessage(e) });
    } finally {
      setStartedAt(null);
      onDone?.();
      window.dispatchEvent(new Event(RUNS_CHANGED_EVENT));
    }
  };
  const secs = startedAt !== null ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  // The API rejects simulate without the admin token, so only show the button when the URL carries ?token=.
  if (!USE_MOCKS && !hasToken) return null;
  return (
    <Button onClick={run} disabled={busy} aria-live="polite">
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Zap aria-hidden />}
      {busy ? `Simulating… ${secs}s` : 'Simulate traffic'}
    </Button>
  );
}

function isInFlight(r: RunListItem): boolean {
  return r.outcome === null && !r.cost_usd;
}

function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-2xs font-semibold uppercase tracking-wide', className)}>
      {children}
    </span>
  );
}

function RunRow({ r, now }: { r: RunListItem; now: number }) {
  const inFlight = isInFlight(r);
  // The API cuts previews at PREVIEW_MAX chars with no marker; add the ellipsis so a cut snippet reads as one.
  const cut = r.preview && r.preview.length >= PREVIEW_MAX ? `${r.preview.trimEnd()}…` : r.preview;
  const preview = cut ?? (inFlight ? 'No reply yet' : r.scenario ? null : 'No reply');
  return (
    <li>
      <Link href={`/runs/${r.id}`} className="block px-4 py-3 outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="font-mono text-sm font-bold text-foreground">{r.agent}</span>
          {r.version !== null && <span className="font-mono text-muted-foreground">v{r.version}</span>}
          <span
            className={cn(
              'status-word rounded-sm bg-board px-1.5 py-1 text-xs',
              r.mode === 'scenario' ? 'text-board-muted' : 'text-board-ink',
            )}
          >
            {r.mode === 'scenario' ? 'twin' : 'live'}
          </span>
          {inFlight && (
            <Tag className="border-running-border bg-running-subtle text-running">
              <CircleDashed className="size-3 animate-running-ring" aria-hidden /> running
            </Tag>
          )}
          {r.outcome === 'error' && (
            <Tag className="border-warn-border bg-warn-subtle text-warn">
              <TriangleAlert className="size-3" aria-hidden /> error
            </Tag>
          )}
          <span className="ml-auto tabular-nums text-muted-foreground">{fmtRelative(r.started_at, now)}</span>
        </div>
        <p className="mt-1 truncate text-sm text-muted-foreground" title={r.preview ?? undefined}>
          {r.scenario && <span className="font-mono text-xs">{r.scenario}</span>}
          {r.scenario && preview && ' · '}
          {preview && <span className={cn(!r.preview && 'italic')}>{preview}</span>}
        </p>
        {!inFlight && <span className="mt-0.5 block font-mono text-xs text-muted-foreground tabular-nums">{fmtCost(r.cost_usd)}</span>}
      </Link>
    </li>
  );
}

/** Recent runs (all agents, or one), newest first. Polls every 5 s and refetches after a simulation. */
export function ActivityFeed({ agent, limit = 8, className }: { agent?: string; limit?: number; className?: string }) {
  const { data, error, loading, refetch } = useData(`runs:${agent ?? '*'}:${limit}`, () => getRuns({ limit, agent }), {
    pollMs: POLL_MS,
  });
  const now = useNow(15000);

  useEffect(() => {
    const onChange = () => void refetch();
    window.addEventListener(RUNS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(RUNS_CHANGED_EVENT, onChange);
  }, [refetch]);

  return (
    <section className={cn('panel flex min-w-0 flex-col overflow-hidden', className)} aria-label="Recent activity">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="board-title flex items-center gap-2 text-2xl">
          <Activity className="size-5 text-muted-foreground" aria-hidden /> Recent activity
        </h2>
        {data && !error && (
          <span className="inline-flex items-center gap-2 text-xs whitespace-nowrap text-muted-foreground">
            <span className="lamp text-pass" data-blink="true" aria-hidden />
            updates every 5s
          </span>
        )}
      </header>
      {data && error && (
        <div className="border-b px-4 py-2">
          <StaleNotice error={error} onRetry={refetch} />
        </div>
      )}
      {loading && !data ? (
        <ul className="flex flex-col gap-3 p-4" aria-busy="true" aria-label="Loading activity">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-4 w-full" />
            </li>
          ))}
        </ul>
      ) : error && !data ? (
        <ErrorState title="Couldn't load recent activity" error={error} onRetry={refetch} className="m-4" />
      ) : data && data.length === 0 ? (
        <EmptyState icon={<Activity />} title="No runs yet" className="m-4">
          {agent
            ? 'Chat with the live version or deploy to run the gate. Every run shows up here with its trace.'
            : 'Simulate traffic or chat with an agent. Every run shows up here with its trace.'}
        </EmptyState>
      ) : (
        <ul className="divide-y">
          {(data ?? []).map((r) => (
            <RunRow key={r.id} r={r} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}
