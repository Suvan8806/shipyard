'use client';
// Spec diff: added/removed lines with a +/− glyph column (reads without color), long unchanged runs folded.
import { useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VersionDiff } from '../stress/contract';

type Line = VersionDiff['spec_diff'][number];
type Chunk = { kind: 'lines'; lines: Line[] } | { kind: 'fold'; lines: Line[] };

const CONTEXT = 3;

/** Splits the diff into visible lines and folds of unchanged lines more than CONTEXT away from a change. */
export function foldDiff(lines: Line[], context = CONTEXT): Chunk[] {
  const near = lines.map((_, i) => lines.slice(Math.max(0, i - context), i + context + 1).some((l) => l.kind !== 'same'));
  const chunks: Chunk[] = [];
  lines.forEach((l, i) => {
    const kind = near[i] ? 'lines' : 'fold';
    const last = chunks[chunks.length - 1];
    if (last && last.kind === kind) last.lines.push(l);
    else chunks.push({ kind, lines: [l] });
  });
  return chunks;
}

function DiffLine({ l }: { l: Line }) {
  return (
    <div
      className={cn(
        'grid grid-cols-[2.5rem_1.25rem_1fr] font-mono text-[13px] leading-[22px]',
        l.kind === 'add' && 'bg-diff-add-bg',
        l.kind === 'del' && 'bg-diff-remove-bg',
      )}
    >
      <span className="border-r bg-muted pr-2 text-right text-muted-foreground select-none">{l.line}</span>
      <span
        className={cn('text-center font-semibold select-none', l.kind === 'add' && 'text-diff-add', l.kind === 'del' && 'text-diff-remove')}
        aria-label={l.kind === 'add' ? 'added' : l.kind === 'del' ? 'removed' : undefined}
      >
        {l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ''}
      </span>
      <span className={cn('pr-3 break-words whitespace-pre-wrap', l.kind !== 'same' && 'font-semibold')}>{l.text || ' '}</span>
    </div>
  );
}

function Fold({ lines }: { lines: Line[] }) {
  const [open, setOpen] = useState(false);
  if (open) return lines.map((l, i) => <DiffLine key={i} l={l} />);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex w-full items-center gap-2 border-y bg-muted/60 px-3 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <ChevronsUpDown className="size-3.5" aria-hidden /> {lines.length} unchanged {lines.length === 1 ? 'line' : 'lines'}
    </button>
  );
}

export function SpecDiff({ diff, fileName }: { diff: VersionDiff; fileName: string }) {
  const added = diff.spec_diff.filter((l) => l.kind === 'add').length;
  const removed = diff.spec_diff.filter((l) => l.kind === 'del').length;
  const chunks = foldDiff(diff.spec_diff);
  return (
    <section aria-labelledby="spec-diff" className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2">
        <h2 id="spec-diff" className="font-mono text-[13px] font-semibold">
          {fileName}
        </h2>
        <span className="text-xs text-muted-foreground">
          v{diff.from} → v{diff.to}
        </span>
        <span className="ml-auto font-mono text-xs">
          <span className="text-diff-add">+{added}</span> <span className="text-diff-remove">−{removed}</span>
        </span>
      </header>
      {added + removed === 0 ? (
        <p className="px-3 py-6 text-sm text-muted-foreground">The spec is identical in both versions.</p>
      ) : (
        <div className="min-w-0 overflow-x-auto">
          {chunks.map((c, i) =>
            c.kind === 'fold' ? <Fold key={i} lines={c.lines} /> : c.lines.map((l, j) => <DiffLine key={`${i}-${j}`} l={l} />),
          )}
        </div>
      )}
    </section>
  );
}
