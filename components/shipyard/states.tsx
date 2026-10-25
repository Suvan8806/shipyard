'use client';
// Shared loading / empty / error states for every dashboard fetch.
// Convention: render <ErrorState> only when there is no data yet (`error && !data`). When a poll or refetch fails
// after data loaded, keep showing the stale data and surface <StaleNotice> (or a toast) instead.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, RotateCw, SearchX, TriangleAlert, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Flap } from './flap';
import { cn } from '@/lib/utils';
import { ApiRequestError } from './api';

function isNetwork(error: Error): boolean {
  return error instanceof ApiRequestError && (error.code === 'network' || error.status === 0);
}

/** True when the API confirmed the thing does not exist (HTTP 404). */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

/** Styled "not found" page body: unknown agent, version, run, or URL. */
export function NotFoundState({
  title,
  children,
  backHref = '/agents',
  backLabel = 'Back to agents',
}: {
  title: string;
  children?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="board mx-auto flex w-full max-w-3xl flex-col gap-5 overflow-hidden p-6 sm:p-8">
      <div className="flex flex-wrap items-center gap-4">
        <Flap text="404" tone="signal" animate className="text-5xl" label="Error 404" />
        <SearchX className="size-8 shrink-0 text-board-muted" aria-hidden />
      </div>
      <div className="min-w-0">
        <h1 className="board-title text-3xl text-board-ink sm:text-4xl">{title}</h1>
        {children && <p className="mt-2 max-w-prose text-lg text-board-muted [&_.text-foreground]:text-board-ink">{children}</p>}
      </div>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 self-start rounded-md bg-signal px-4 py-2.5 text-sm font-bold text-signal-foreground transition-colors hover:bg-[color-mix(in_oklch,var(--signal),black_8%)] focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-board focus-visible:outline-none"
      >
        <ArrowLeft className="size-4" aria-hidden /> {backLabel}
      </Link>
    </div>
  );
}

export function ErrorState({
  title,
  error,
  onRetry,
  className,
}: {
  title: string;
  error: Error;
  onRetry?: () => void | Promise<void>;
  className?: string;
}) {
  const notFound = error instanceof ApiRequestError && error.status === 404;
  const Icon = isNetwork(error) ? WifiOff : TriangleAlert;
  return (
    <div
      role="alert"
      className={cn('panel flex flex-col items-start gap-3 border-warn-border p-5', className)}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-warn-solid text-warn-solid-foreground"><Icon className="size-5" aria-hidden /></span>
        <div className="min-w-0">
          <p className="board-title text-2xl text-foreground">{title}</p>
          <p className="mt-1 font-mono text-sm break-words text-muted-foreground">{error.message}</p>
        </div>
      </div>
      {onRetry && !notFound && (
        <Button onClick={() => void onRetry()}>
          <RotateCw aria-hidden /> Retry
        </Button>
      )}
    </div>
  );
}

/** Small inline note shown above stale data when a background refresh failed. */
export function StaleNotice({ error, onRetry }: { error: Error | null; onRetry?: () => void | Promise<void> }) {
  if (!error) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 text-xs text-warn">
      <TriangleAlert className="size-3.5" aria-hidden />
      <span>Couldn&apos;t refresh: {error.message}. Showing the last loaded data.</span>
      {onRetry && (
        <button type="button" className="font-semibold underline" onClick={() => void onRetry()}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 rounded-md border-2 border-dashed border-input bg-card/60 px-6 py-10 text-center', className)}>
      {icon && <div className="mb-1 grid size-12 place-items-center rounded-md bg-board text-signal [&_svg]:size-6">{icon}</div>}
      <p className="board-title text-2xl">{title}</p>
      {children && <div className="max-w-prose text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Table-shaped skeleton: `rows` lines of `cols` cells. */
export function TableSkeleton({ rows = 6, cols = 5, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={cn('panel flex flex-col gap-2 p-4', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={cn('h-5', c === 0 ? 'w-1/4' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export { Skeleton };
