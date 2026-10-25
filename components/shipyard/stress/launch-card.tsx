'use client';
// One launch card on the stress lab: controls, a live cost estimate, and an inline confirm step
// ("This will spend about $X of the $Y budget left") before anything is spent.
import { useState, type ReactNode } from 'react';
import { Loader2, Minus, Play, Plus, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ApiRequestError, errorMessage } from '../api';
import type { StressMode } from './contract';
import { MODE_META } from './shared';

const usd = (n: number) => `$${n.toFixed(2)}`;

export function LaunchCard({
  mode,
  runsLabel,
  estimate,
  left,
  disabledReason,
  onLaunch,
  children,
}: {
  mode: StressMode;
  /** e.g. "46 tests × 3 runs = 138 test runs" */
  runsLabel: string;
  estimate: number;
  /** Remaining budget, or null when unknown. */
  left: number | null;
  disabledReason?: string | null;
  onLaunch: () => Promise<void>;
  children: ReactNode;
}) {
  const meta = MODE_META[mode];
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overBudget = left !== null && estimate > left;

  const launch = async () => {
    setBusy(true);
    setError(null);
    try {
      await onLaunch();
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 402) setError(`Over budget. ${e.message}`);
      else if (e instanceof ApiRequestError && e.status === 429) setError('Rate limited. Wait a few seconds and start it again.');
      else setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <article aria-labelledby={`launch-${mode}`} className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5">
      <header className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border bg-muted text-foreground">
          <meta.Icon className="size-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id={`launch-${mode}`} className="text-lg font-semibold">
            {meta.label}
          </h2>
          <p className="text-sm text-muted-foreground">{meta.blurb}</p>
        </div>
      </header>

      <div className="flex flex-col gap-3">{children}</div>

      <div className="mt-auto flex flex-col gap-3 border-t pt-4">
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-sm text-muted-foreground">{runsLabel}</span>
          <span className={cn('font-mono text-base font-semibold tabular-nums', overBudget && 'text-fail')}>~{usd(estimate)}</span>
        </p>

        {!confirming ? (
          <Button
            variant="outline"
            className="w-full sm:w-auto sm:self-start"
            disabled={!!disabledReason}
            title={disabledReason ?? undefined}
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
          >
            <Play aria-hidden /> Start {meta.label.toLowerCase()}
          </Button>
        ) : (
          <div role="group" aria-label="Confirm spend" className="flex flex-col gap-3 rounded-md border bg-muted p-3">
            <p className="text-sm">
              This will spend about <span className="font-mono font-semibold">{usd(estimate)}</span>
              {left !== null ? (
                <>
                  {' '}of the <span className="font-mono font-semibold">{usd(left)}</span> budget left.
                </>
              ) : (
                '. The server checks the budget before it starts.'
              )}{' '}
              It&apos;s a dry run: what&apos;s serving doesn&apos;t change.
            </p>
            {overBudget && (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-fail">
                <TriangleAlert className="size-4" aria-hidden /> That&apos;s more than the budget left. Lower the size first.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void launch()} disabled={busy || overBudget}>
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
                {busy ? 'Starting…' : `Spend ~${usd(estimate)}`}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {disabledReason && <p className="text-xs text-muted-foreground">{disabledReason}</p>}
        {error && (
          <p role="alert" className="flex items-start gap-1.5 text-sm text-warn">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
          </p>
        )}
      </div>
    </article>
  );
}

/** Stepper for an integer in [min, max]: big touch targets, readable on a projector. */
export function NumberStepper({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (n: number) => void;
}) {
  const id = `stepper-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" aria-label={`Fewer ${unit}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
          <Minus aria-hidden />
        </Button>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-2 min-w-0 flex-1 accent-primary"
        />
        <Button variant="outline" size="icon" aria-label={`More ${unit}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
          <Plus aria-hidden />
        </Button>
        <span className="w-28 shrink-0 text-right whitespace-nowrap">
          <span className="text-2xl font-bold tabular-nums">{value}</span> <span className="text-sm text-muted-foreground">{unit}</span>
        </span>
      </div>
    </div>
  );
}
