'use client';
// Model matrix: one column per model with a pass-rate bar, cost, latency and the tests it failed. The winner
// (highest pass rate, then cheapest) gets a badge once every model has finished.
import { Award, CircleCheck, CircleDashed, OctagonX, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtCost, fmtPct } from '../format';
import type { MatrixModel, StressResult } from './contract';
import { shortModel } from './estimate';

function isRunning(m: MatrixModel) {
  return m.status === 'running' || m.pass_rate === null;
}

/** Highest pass rate, ties broken by cost. Null until every model has a result. */
export function pickWinner(models: MatrixModel[]): string | null {
  if (models.length === 0 || models.some(isRunning)) return null;
  const best = [...models].sort((a, b) => (b.pass_rate ?? 0) - (a.pass_rate ?? 0) || (a.cost_usd ?? Infinity) - (b.cost_usd ?? Infinity))[0];
  return best.model;
}

function PassBar({ rate }: { rate: number | null }) {
  if (rate === null) return <div className="h-3 animate-pulse rounded-sm bg-running-subtle" aria-hidden />;
  const pct = Math.round(rate * 1000) / 10;
  return (
    <div className="flex h-3 overflow-hidden rounded-sm border" aria-hidden>
      <div className="bg-pass" style={{ width: `${pct}%` }} />
      <div className="bg-fail-solid" style={{ width: `${100 - pct}%` }} />
    </div>
  );
}

function Column({ m, winner }: { m: MatrixModel; winner: boolean }) {
  const running = isRunning(m);
  const perfect = m.pass_rate === 1;
  return (
    <article
      aria-label={shortModel(m.model)}
      className={cn('flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-4', winner && 'border-foreground ring-1 ring-foreground')}
    >
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-mono text-lg font-semibold break-all">{shortModel(m.model)}</h3>
          {winner && (
            <span className="inline-flex items-center gap-1 rounded-sm bg-foreground px-1.5 py-0.5 text-background">
              <Award className="size-3.5" strokeWidth={2} aria-hidden />
              <span className="status-word text-sm">Winner</span>
            </span>
          )}
        </div>
        <p className="font-mono text-xs break-all text-muted-foreground">{m.model}</p>
      </header>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="field-label">Pass rate</span>
          {running ? (
            <span className="inline-flex items-center gap-1.5 text-running">
              <CircleDashed className="size-4 animate-running-ring" aria-hidden />
              <span className="status-word text-sm">Under test</span>
            </span>
          ) : (
            <span className={cn('text-3xl font-bold tabular-nums', !perfect && 'text-fail')}>{fmtPct(m.pass_rate)}</span>
          )}
        </div>
        <PassBar rate={running ? null : m.pass_rate} />
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="field-label">Cost</dt>
          <dd className="font-mono text-lg font-semibold tabular-nums">{running ? '—' : fmtCost(m.cost_usd, 2)}</dd>
        </div>
        <div>
          <dt className="field-label">Avg latency</dt>
          <dd className="font-mono text-lg font-semibold tabular-nums">
            {running || m.avg_latency_ms === null ? '—' : `${(m.avg_latency_ms / 1000).toFixed(1)} s`}
          </dd>
        </div>
      </dl>

      {!running && (
        <div className="flex flex-col gap-1.5 border-t pt-3">
          {m.failed.length === 0 ? (
            m.status === 'error' ? (
              <p className="inline-flex items-center gap-1.5 text-sm text-warn">
                <TriangleAlert className="size-4" aria-hidden /> Couldn&apos;t finish on this model.
              </p>
            ) : (
              <p className="inline-flex items-center gap-1.5 text-sm text-pass">
                <CircleCheck className="size-4" strokeWidth={1.75} aria-hidden /> Every test passed
              </p>
            )
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-fail">
                <OctagonX className="size-4" strokeWidth={1.75} aria-hidden /> {m.failed.length} failed
              </span>
              <ul className="flex flex-col gap-0.5">
                {m.failed.map((f) => (
                  <li key={f} className="truncate font-mono text-xs" title={f}>
                    {f}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </article>
  );
}

export function MatrixView({ r }: { r: StressResult }) {
  const models = r.matrix?.models ?? [];
  if (models.length === 0) return null;
  const winner = pickWinner(models);
  const cols = models.length >= 4 ? 'xl:grid-cols-4' : models.length === 3 ? 'lg:grid-cols-3' : 'md:grid-cols-2';
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-sm text-muted-foreground">
        Same spec, same tests, same twin data on every model. Only the model changes.
      </p>
      <div className={cn('grid gap-3 sm:grid-cols-2', cols)}>
        {models.map((m) => (
          <Column key={m.model} m={m} winner={m.model === winner} />
        ))}
      </div>
    </div>
  );
}
