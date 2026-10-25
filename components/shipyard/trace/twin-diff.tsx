'use client';
// Twin diff panel (design/direction.md 4.5 + 7.2): per changed table, rows with a leading + / − / ~ glyph column,
// changed cells show `before → after`. Untouched rows for the same account appear as muted context rows.
import { useState } from 'react';
import { Database } from 'lucide-react';
import type { Row, Snapshot, TableDiff, TwinDiff } from '@/lib/types';
import { cn } from '@/lib/utils';
import { fmtDateTime } from '../format';
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
  if (MONEY_COLS.has(col)) {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (Number.isFinite(n)) return `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;
  }
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  const s = String(v);
  // ISO timestamps in local time, formatted like the run header.
  return /^\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(Date.parse(s)) ? fmtDateTime(s) : s;
}

const GLYPH: Record<Kind, string> = { added: '+', removed: '−', changed: '~', context: '', same: '' };

function RowsTable({ rows, cols }: { rows: DiffRow[]; cols: string[] }) {
  return (
    <div className="max-w-full min-w-0 overflow-x-auto rounded-[4px] border">
      <table className="w-full min-w-max font-mono text-xs">
        <thead className="border-b bg-muted text-left text-muted-foreground">
          <tr>
            <th className="w-6" aria-label="Change" />
            {cols.map((c) => (
              <th key={c} className="px-2.5 py-2 font-semibold whitespace-nowrap">
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
                  'w-6 px-1.5 text-center text-sm font-bold',
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
                    className={cn('max-w-[280px] truncate px-2.5 py-2 whitespace-nowrap tabular-nums', hot && 'bg-diff-cell font-semibold')}
                    title={hot && r.before ? `${cell(c, r.before[c])} → ${value}` : value}
                  >
                    {hot && r.before ? (
                      <>
                        <span className="font-normal text-muted-foreground">{cell(c, r.before[c])}</span>
                        <span className="px-1 font-normal text-muted-foreground" aria-hidden>→</span>
                        <span className="sr-only"> to </span>
                        {value}
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

const KEY_COLS = ['id', 'account_id'];

/**
 * Columns for a table in the Changes view. A table with only changed rows shows its key columns plus the columns that
 * changed, changed ones first, so the `before → after` cell is never pushed off the side of a narrow panel.
 */
function diffColumns(rows: DiffRow[]): string[] {
  const all = columnsOf(rows.map((r) => r.row));
  if (rows.length === 0 || rows.some((r) => r.kind !== 'changed')) return all;
  const changed = new Set(rows.flatMap((r) => r.changed ?? []));
  return [...all.filter((c) => KEY_COLS.includes(c) && !changed.has(c)), ...all.filter((c) => changed.has(c))];
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
          <div key={table} className="flex min-w-0 flex-col gap-1.5">
            <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-sm font-semibold">
              {table}
              <span className="inline-flex gap-2 text-xs font-semibold tabular-nums">
                <span className={added.length ? 'text-diff-add' : 'font-normal text-muted-foreground'}>+{added.length}</span>
                <span className={removed.length ? 'text-diff-remove' : 'font-normal text-muted-foreground'}>−{removed.length}</span>
                <span className={changed.length ? 'text-diff-change' : 'font-normal text-muted-foreground'}>~{changed.length}</span>
              </span>
            </h3>
            <RowsTable rows={rows} cols={diffColumns(rows)} />
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
        <div key={table} className="flex min-w-0 flex-col gap-1.5">
          <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-sm font-semibold">
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
    <section id="twin-diff" className="panel flex min-w-0 scroll-mt-6 flex-col gap-4 p-4 sm:p-5" aria-label="Twin diff">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div className="min-w-0">
          <h2 className="board-title text-2xl">Twin diff</h2>
          <p className="mt-1 text-sm text-muted-foreground">What this run changed in its twin database</p>
        </div>
        <div
          role="group"
          aria-label="Diff view"
          className="inline-flex rounded-[4px] bg-board p-0.5"
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
                'status-word rounded-[3px] px-2.5 py-1.5 text-[0.8125rem] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-1 focus-visible:ring-offset-board disabled:cursor-not-allowed disabled:opacity-40',
                active === m ? 'bg-signal text-signal-foreground' : 'text-board-muted hover:text-board-ink',
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
