'use client';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Safe JSON.stringify: never throws (cycles, BigInt), always returns a string. */
export function toJson(value: unknown, indent?: number): string {
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value, null, indent) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Collapsible pretty-printed JSON (mono, muted surface). `preview` shows a one-line summary while closed. */
export function JsonBlock({
  label,
  value,
  preview = false,
  defaultOpen = false,
  className,
}: {
  label: string;
  value: unknown;
  preview?: boolean;
  defaultOpen?: boolean;
  className?: string;
}) {
  const oneLine = preview ? toJson(value) : '';
  return (
    <details className={cn('group min-w-0 rounded-[4px] border bg-muted/50', className)} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3 shrink-0 transition-transform group-open:rotate-90" strokeWidth={2} aria-hidden />
        <span className="shrink-0 font-semibold tracking-[0.06em] uppercase">{label}</span>
        {preview && (
          <span className="min-w-0 truncate font-mono font-normal group-open:hidden" title={oneLine}>
            {oneLine}
          </span>
        )}
      </summary>
      <pre className="max-h-96 overflow-auto border-t bg-card px-3 py-2 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words">
        {toJson(value, 2)}
      </pre>
    </details>
  );
}
