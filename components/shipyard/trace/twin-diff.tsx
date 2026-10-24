'use client';
import { useState } from 'react';
import type { Row, Snapshot, TwinDiff } from '@/lib/types';
import { cn } from '@/lib/utils';

function columnsOf(rows: Row[]): string[] {
  const cols = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) cols.add(k);
  return [...cols];
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}T/.test(s) ? s.slice(5, 16).replace('T', ' ') : s;
}

type Kind = 'added' | 'removed' | 'changed' | 'same';

function RowsTable({ rows, cols }: { rows: { kind: Kind; row: Row; changed?: string[]; before?: Row }[]; cols: string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full font-mono text-xs">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="w-5" />
            {cols.map((c) => (
              <th key={c} className="px-2 py-1 font-medium whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className={cn(
                r.kind === 'added' && 'sy-bg-green',
                r.kind === 'removed' && 'sy-bg-red line-through decoration-1',
                r.kind === 'changed' && 'sy-bg-amber',
              )}
            >
              <td
                className={cn(
                  'px-1 text-center font-bold',
                  r.kind === 'added' && 'sy-text-green',
                  r.kind === 'removed' && 'sy-text-red',
                  r.kind === 'changed' && 'sy-text-amber',
                )}
              >
                {r.kind === 'added' ? '+' : r.kind === 'removed' ? '−' : r.kind === 'changed' ? '~' : ''}
              </td>
              {cols.map((c) => {
                const hot = r.changed?.includes(c);
                return (
                  <td key={c} className={cn('max-w-[260px] truncate px-2 py-1 whitespace-nowrap', hot && 'sy-text-amber font-bold')} title={cell(r.row[c])}>
                    {hot && r.before ? (
                      <>
                        <span className="text-muted-foreground line-through">{cell(r.before[c])}</span> → {cell(r.row[c])}
                      </>
                    ) : (
                      cell(r.row[c])
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Per-table twin diff (green added, red removed, amber changed) with a toggle to the full before/after snapshot. */
export function TwinDiffPanel({ diff, before, after }: { diff: TwinDiff; before: Snapshot | null; after: Snapshot | null }) {
  const [mode, setMode] = useState<'diff' | 'before' | 'after'>('diff');
  const tables = Object.entries(diff).filter(([, d]) => d && (d.added.length || d.removed.length || d.changed.length));
  const hasSnap = !!before && !!after;
  const snap = mode === 'before' ? before : mode === 'after' ? after : null;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4" aria-label="Twin diff">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Twin database diff</h2>
          <p className="text-xs text-muted-foreground">What the agent actually changed in its throwaway copy of the data.</p>
        </div>
        {hasSnap && (
          <div className="inline-flex rounded-lg border p-0.5 text-xs">
            {(['diff', 'before', 'after'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn('rounded-md px-2.5 py-1 font-medium capitalize', mode === m ? 'bg-foreground text-background' : 'text-muted-foreground')}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </header>
      {mode === 'diff' ? (
        tables.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No writes. The data is exactly as seeded.</p>
        ) : (
          tables.map(([table, d]) => {
            const rows = [
              ...d!.added.map((row) => ({ kind: 'added' as const, row })),
              ...d!.removed.map((row) => ({ kind: 'removed' as const, row })),
              ...d!.changed.map((c) => ({ kind: 'changed' as const, row: c.after, before: c.before, changed: c.columns })),
            ];
            const counts = [
              d!.added.length && `+${d!.added.length}`,
              d!.removed.length && `−${d!.removed.length}`,
              d!.changed.length && `~${d!.changed.length}`,
            ].filter(Boolean);
            return (
              <div key={table} className="flex flex-col gap-1.5">
                <h3 className="flex items-center gap-2 font-mono text-sm font-semibold">
                  {table} <span className="text-xs font-normal text-muted-foreground">{counts.join(' ')}</span>
                </h3>
                <RowsTable rows={rows} cols={columnsOf(rows.map((r) => r.row))} />
              </div>
            );
          })
        )
      ) : (
        Object.entries(snap ?? {})
          .filter(([, rows]) => rows.length > 0)
          .map(([table, rows]) => (
            <div key={table} className="flex flex-col gap-1.5">
              <h3 className="font-mono text-sm font-semibold">
                {table} <span className="text-xs font-normal text-muted-foreground">{rows.length} rows</span>
              </h3>
              <RowsTable rows={rows.map((row) => ({ kind: 'same' as const, row }))} cols={columnsOf(rows)} />
            </div>
          ))
      )}
    </section>
  );
}
