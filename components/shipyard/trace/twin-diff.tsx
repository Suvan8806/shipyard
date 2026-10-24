'use client';
// Twin diff panel (design/direction.md 4.5 + 7.2): per changed table, rows with a leading + / − / ~ glyph column,
// changed cells show `before → after`. Untouched rows for the same account appear as muted context rows.
import { useState } from 'react';
import { Database } from 'lucide-react';
import type { Row, Snapshot, TableDiff, TwinDiff } from '@/lib/types';
import { cn } from '@/lib/utils';
import { EmptyState } from '../states';

type Kind = 'added' | 'removed' | 'changed' | 'context' | 'same';
interface DiffRow {
  kind: Kind;
  row: Row;
  before?: Row;
  changed?: string[];
}

const MONEY_COLS = new Set(['amount', 'balance', 'monthly_payment', 'new_balance']);
const MAX_CONTEXT_ROWS = 5;

function columnsOf(rows: Row[]): string[] {
  const cols = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r ?? {})) cols.add(k);
  return [...cols];
}

function cell(col: string, v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (MONEY_COLS.has(col) && typeof v === 'number') return `$${v.toFixed(2)}`;
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}T/.test(s) ? s.slice(5, 16).replace('T', ' ') : s;
}

const GLYPH: Record<Kind, string> = { added: '+', removed: '−', changed: '~', context: '', same: '' };

function RowsTable({ rows, cols }: { rows: DiffRow[]; cols: string[] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full font-mono text-xs">
        <thead className="border-b bg-muted/60 text-left text-muted-foreground">
          <tr>
            <th className="w-6" aria-label="Change" />
            {cols.map((c) => (
              <th key={c} className="px-2 py-1.5 font-medium whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr
              key={i}
              className={cn(
                r.kind === 'added' && 'bg-diff-add-bg',
                r.kind === 'removed' && 'bg-diff-remove-bg',
                r.kind === 'changed' && 'bg-diff-change-bg',
                r.kind === 'context' && 'text-muted-foreground',
              )}
            >
              <td
                className={cn(
                  'px-1.5 text-center font-bold',
                  r.kind === 'added' && 'text-diff-add',
                  r.kind === 'removed' && 'text-diff-remove',
                  r.kind === 'changed' && 'text-diff-change',
                )}
              >
                {GLYPH[r.kind]}
              </td>
              {cols.map((c) => {
                const hot = r.kind === 'changed' && r.changed?.includes(c);
                const value = cell(c, r.row?.[c]);
                return (
                  <td
                    key={c}
                    className={cn('max-w-[280px] truncate px-2 py-1.5 whitespace-nowrap', hot && 'bg-diff-cell font-semibold')}
                    title={hot && r.before ? `${cell(c, r.before[c])} → ${value}` : value}
                  >
                    {hot && r.before ? (
                      <>
                        <span className="text-muted-foreground">{cell(c, r.before[c])}</span> → {value}
                      </>
                    ) : (
                      value
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

function rowKey(r: Row): string {
  return r && 'id' in r ? `id:${String(r.id)}` : JSON.stringify(r);
}

/** Untouched rows from the before snapshot that share an account with a changed row (e.g. the first $25 credit). */
function contextRows(d: TableDiff, before: Row[] | undefined): Row[] {
  if (!before?.length) return [];
  const touched = new Set([...d.removed, ...d.changed.map((c) => c.before)].map(rowKey));
  const accounts = new Set<unknown>(
    [...d.added, ...d.changed.map((c) => c.after)].map((r) => r?.account_id).filter((a) => a !== undefined && a !== null),
  );
  if (accounts.size === 0) return [];
  return before.filter((r) => !touched.has(rowKey(r)) && accounts.has(r.account_id)).slice(0, MAX_CONTEXT_ROWS);
}

function DiffTables({ diff, before }: { diff: TwinDiff; before: Snapshot | null }) {
  const tables = Object.entries(diff).filter(
    (entry): entry is [string, TableDiff] =>
      !!entry[1] && (entry[1].added?.length > 0 || entry[1].removed?.length > 0 || entry[1].changed?.length > 0),
  );
  if (tables.length === 0) {
    return <EmptyState title="No writes">The twin data is exactly as seeded. This run changed nothing.</EmptyState>;
  }
  return (
    <>
      {tables.map(([table, d]) => {
        const added = d.added ?? [];
        const removed = d.removed ?? [];
        const changed = d.changed ?? [];
        const rows: DiffRow[] = [
          ...contextRows({ added, removed, changed }, (before as Record<string, Row[]> | null)?.[table]).map((row) => ({
            kind: 'context' as const,
            row,
          })),
          ...removed.map((row) => ({ kind: 'removed' as const, row })),
          ...changed.map((c) => ({ kind: 'changed' as const, row: c.after, before: c.before, changed: c.columns })),
          ...added.map((row) => ({ kind: 'added' as const, row })),
        ];
        return (
          <div key={table} className="flex flex-col gap-1.5">
            <h3 className="flex items-baseline gap-2 font-mono text-sm font-semibold">
              {table}
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                +{added.length} −{removed.length} ~{changed.length}
              </span>
            </h3>
            <RowsTable rows={rows} cols={columnsOf(rows.map((r) => r.row))} />
          </div>
        );
      })}
    </>
  );
}

function SnapshotTables({ snap }: { snap: Snapshot }) {
  const tables = Object.entries(snap as Record<string, Row[] | undefined>).filter(([, rows]) => Array.isArray(rows) && rows.length > 0);
  if (tables.length === 0) return <EmptyState title="Every table is empty" />;
  return (
    <>
      {tables.map(([table, rows]) => (
        <div key={table} className="flex flex-col gap-1.5">
          <h3 className="flex items-baseline gap-2 font-mono text-sm font-semibold">
            {table} <span className="text-xs font-normal text-muted-foreground tabular-nums">{rows!.length} rows</span>
          </h3>
          <RowsTable rows={rows!.map((row) => ({ kind: 'same' as const, row }))} cols={columnsOf(rows!)} />
        </div>
      ))}
    </>
  );
}

type View = 'changes' | 'before' | 'after';

/** `diff` null means the run captured no diff (in progress, errored early, or not recorded). */
export function TwinDiffPanel({
  diff,
  before,
  after,
  inProgress = false,
}: {
  diff: TwinDiff | null;
  before: Snapshot | null;
  after: Snapshot | null;
  inProgress?: boolean;
}) {
  const [view, setView] = useState<View>('changes');
  const hasSnap = !!before && !!after;
  const active: View = hasSnap ? view : 'changes';

  return (
    <section id="twin-diff" className="flex scroll-mt-6 flex-col gap-3 rounded-md border bg-card p-4" aria-label="Twin diff">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Twin diff</h2>
          <p className="text-sm text-muted-foreground">What this run changed in its twin database</p>
        </div>
        <div
          role="group"
          aria-label="Diff view"
          className="inline-flex rounded-md border p-0.5 text-xs"
          title={hasSnap ? undefined : 'No snapshots were captured for this run'}
        >
          {(['changes', 'before', 'after'] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={m !== 'changes' && !hasSnap}
              aria-pressed={active === m}
              onClick={() => setView(m)}
              className={cn(
                'rounded-sm px-2.5 py-1 font-semibold capitalize transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40',
                active === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </header>
      {active === 'changes' ? (
        diff ? (
          <DiffTables diff={diff} before={before} />
        ) : (
          <EmptyState icon={<Database />} title={inProgress ? 'Run in progress' : 'No changes captured for this run'}>
            {inProgress
              ? 'The twin diff appears when the run finishes.'
              : 'The twin was not diffed, usually because the run stopped before its end state was recorded.'}
          </EmptyState>
        )
      ) : (
        <SnapshotTables snap={(active === 'before' ? before : after)!} />
      )}
    </section>
  );
}
