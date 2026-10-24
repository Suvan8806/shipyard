// Row-level diff of two twin snapshots, keyed by primary key `id` (PRD 9.1, 12).
import { SYS_TABLE_NAMES } from '../sysdb/schema';
import type { DiffSnapshotsFn, Row, TableDiff, TwinDiff } from '../types';

const keyOf = (r: Row): string => String(r.id);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function diffTable(before: Row[], after: Row[]): TableDiff {
  const b = new Map(before.map((r) => [keyOf(r), r]));
  const a = new Map(after.map((r) => [keyOf(r), r]));
  const added = after.filter((r) => !b.has(keyOf(r)));
  const removed = before.filter((r) => !a.has(keyOf(r)));
  const changed: TableDiff['changed'] = [];
  for (const [k, ar] of a) {
    const br = b.get(k);
    if (!br) continue;
    const cols = [...new Set([...Object.keys(br), ...Object.keys(ar)])].filter((c) => !same(br[c], ar[c]));
    if (cols.length) changed.push({ before: br, after: ar, columns: cols });
  }
  return { added, removed, changed };
}

export const diffSnapshots: DiffSnapshotsFn = (before, after) => {
  const out: TwinDiff = {};
  for (const table of SYS_TABLE_NAMES) {
    const d = diffTable(before?.[table] ?? [], after?.[table] ?? []);
    if (d.added.length || d.removed.length || d.changed.length) out[table] = d;
  }
  return out;
};

/** Number of rows added across all tables (used in summaries and tests). */
export function countAdded(diff: TwinDiff | null | undefined, table?: keyof TwinDiff): number {
  if (!diff) return 0;
  if (table) return diff[table]?.added.length ?? 0;
  return Object.values(diff).reduce((n, d) => n + (d?.added.length ?? 0), 0);
}
