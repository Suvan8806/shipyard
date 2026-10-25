'use client';
// Shared loading / empty / error states for every dashboard fetch.
// Convention: render <ErrorState> only when there is no data yet (`error && !data`). When a poll or refetch fails
// after data loaded, keep showing the stale data and surface <StaleNotice> (or a toast) instead.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, RotateCw, SearchX, TriangleAlert, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-6">
      <p className="font-mono text-sm font-semibold tracking-wide text-muted-foreground">404</p>
      <div className="flex items-start gap-3">
        <SearchX className="mt-1 size-6 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-balance">{title}</h1>
          {children && <p className="mt-1 max-w-prose text-muted-foreground">{children}</p>}
        </div>
      </div>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 self-start rounded-md border bg-card px-3 py-1.5 text-sm font-semibold hover:border-primary hover:text-primary"
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
      className={cn('flex flex-col items-start gap-3 rounded-md border border-warn-border bg-warn-subtle p-5', className)}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 break-words text-sm text-muted-foreground">{error.message}</p>
        </div>
      </div>
      {onRetry && !notFound && (
        <Button variant="outline" size="sm" onClick={() => void onRetry()}>
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
    <div className={cn('flex flex-col items-center gap-2 rounded-md border border-dashed px-6 py-10 text-center', className)}>
      {icon && <div className="text-muted-foreground [&_svg]:size-6">{icon}</div>}
      <p className="font-semibold text-balance">{title}</p>
      {children && <div className="max-w-prose text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Table-shaped skeleton: `rows` lines of `cols` cells. */
export function TableSkeleton({ rows = 6, cols = 5, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2 rounded-md border bg-card p-4', className)} aria-busy="true" aria-label="Loading">
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
