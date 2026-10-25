'use client';
// Stress result /agents/[name]/stress/[id]. Polls every 1 s while the job runs.
import { CircleDashed, TriangleAlert } from 'lucide-react';
import { getStress } from '../api';
import { fmtCost, fmtDateTime, fmtDuration } from '../format';
import { ErrorState, Skeleton, StaleNotice } from '../states';
import { useData, useNow } from '../use-data';
import { MatrixView } from './matrix-view';
import { RedteamView } from './redteam-view';
import { ReliabilityView } from './reliability-view';
import { BackLink, isNotDeployed, MODE_META, NotDeployed } from './shared';

const POLL_MS = 1000;

export function StressResultPage({ name, id }: { name: string; id: string }) {
  const enc = encodeURIComponent(name);
  const { data: r, error, loading, refetch } = useData(`stress:${name}:${id}`, () => getStress(name, id), {
    pollMs: POLL_MS,
    shouldPoll: (x) => !x || x.status === 'running',
  });
  const running = r?.status === 'running';
  const now = useNow(1000, running);
  const back = <BackLink href={`/agents/${enc}/stress`}>Stress lab</BackLink>;

  if (loading && !r) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-6" aria-busy="true">
        {back}
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-24" />
        <Skeleton className="h-80" />
      </div>
    );
  }
  if (error && !r) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {back}
        {isNotDeployed(error) ? <NotDeployed /> : <ErrorState title="Couldn't load this stress run" error={error} onRetry={refetch} />}
      </div>
    );
  }
  if (!r) return null;

  const meta = MODE_META[r.mode];
  const elapsed = (r.finished_at ? Date.parse(r.finished_at) : now) - Date.parse(r.created_at);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      {back}
      <header className="flex flex-col gap-3">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
            <meta.Icon className="size-4" strokeWidth={1.75} aria-hidden /> {meta.label}
          </span>
          <span aria-hidden>·</span>
          <span className="font-mono">{name}</span>
          <span aria-hidden>·</span>
          <span>{fmtDateTime(r.created_at)}</span>
          <span aria-hidden>·</span>
          <span className="rounded-sm border px-1.5 py-0.5 text-xs font-semibold">Dry run</span>
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h1 role="status" aria-live="polite" className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
            {running ? (
              <span className="inline-flex items-center gap-2 text-running">
                <CircleDashed className="size-7 animate-running-ring" strokeWidth={1.75} aria-hidden />
                {r.headline || 'Running…'}
              </span>
            ) : r.status === 'error' ? (
              <span className="inline-flex items-center gap-2 text-warn">
                <TriangleAlert className="size-7" strokeWidth={1.75} aria-hidden />
                {r.headline || "The stress run couldn't finish."}
              </span>
            ) : (
              r.headline
            )}
          </h1>
          <p className="flex gap-4 font-mono text-sm text-muted-foreground tabular-nums">
            <span>{fmtDuration(elapsed)}</span>
            <span>{running ? 'cost so far —' : fmtCost(r.total_cost_usd)}</span>
          </p>
        </div>
        {r.status === 'error' && <p className="text-sm text-muted-foreground">Nothing was deployed and the live version didn&apos;t change.</p>}
        <StaleNotice error={error} onRetry={refetch} />
      </header>

      {r.mode === 'reliability' && <ReliabilityView r={r} />}
      {r.mode === 'redteam' && <RedteamView r={r} />}
      {r.mode === 'matrix' && <MatrixView r={r} />}
    </div>
  );
}
