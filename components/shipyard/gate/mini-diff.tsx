import type { Row, TwinDiff } from '@/lib/types';
import { cn } from '@/lib/utils';
import { fmtRowInline } from '../format';

const MONEY_COLS = new Set(['amount', 'balance', 'monthly_payment', 'new_balance']);

function val(col: string, v: unknown): string {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (MONEY_COLS.has(col) && Number.isFinite(n)) return `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;
  return String(v);
}

function rowKey(row: Row): string {
  return String(row.id ?? JSON.stringify(row));
}

/** One-line-per-change twin diff, for gate cards. Green added, red removed, amber changed. */
export function MiniDiff({ diff, max = 4, className }: { diff: TwinDiff | null; max?: number; className?: string }) {
  if (!diff) return null;
  // A seeded or errored run can report {} (no writes) as well as null (not captured).
  const lines: { kind: '+' | '-' | '~'; table: string; text: string; key: string }[] = [];
  for (const [table, d] of Object.entries(diff)) {
    if (!d) continue;
    for (const r of d.added) lines.push({ kind: '+', table, text: fmtRowInline(r), key: `${table}+${rowKey(r)}` });
    for (const r of d.removed) lines.push({ kind: '-', table, text: fmtRowInline(r), key: `${table}-${rowKey(r)}` });
    for (const c of d.changed) {
      const cells = c.columns.map((col) => `${col} ${val(col, c.before[col])} → ${val(col, c.after[col])}`).join(', ');
      lines.push({ kind: '~', table, text: `${String(c.after.id ?? '')} ${cells}`.trim(), key: `${table}~${rowKey(c.after)}` });
    }
  }
  if (lines.length === 0) {
    return <p className={cn('font-mono text-xs text-muted-foreground', className)}>twin: no writes</p>;
  }
  const shown = lines.slice(0, max);
  return (
    <ul className={cn('space-y-0.5 font-mono text-xs leading-relaxed', className)}>
      {shown.map((l) => (
        <li
          key={l.key}
          className={cn(
            'truncate rounded-sm px-1.5 text-foreground',
            l.kind === '+' && 'bg-diff-add-bg',
            l.kind === '-' && 'bg-diff-remove-bg',
            l.kind === '~' && 'bg-diff-change-bg',
          )}
          title={`${l.table} ${l.text}`}
        >
          <span
            className={cn(
              'mr-1 font-semibold',
              l.kind === '+' && 'text-diff-add',
              l.kind === '-' && 'text-diff-remove',
              l.kind === '~' && 'text-diff-change',
            )}
          >
            {l.kind === '-' ? '−' : l.kind}
          </span>
          {l.table} {l.text}
        </li>
      ))}
      {lines.length > max && <li className="px-1.5 text-muted-foreground">+{lines.length - max} more</li>}
    </ul>
  );
}
