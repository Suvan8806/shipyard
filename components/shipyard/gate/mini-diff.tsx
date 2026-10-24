import type { Row, TwinDiff } from '@/lib/types';
import { cn } from '@/lib/utils';
import { fmtRowInline } from '../format';

function rowKey(row: Row): string {
  return String(row.id ?? JSON.stringify(row));
}

/** One-line-per-change twin diff, for gate cards. Green added, red removed, amber changed. */
export function MiniDiff({ diff, max = 4, className }: { diff: TwinDiff | null; max?: number; className?: string }) {
  if (!diff) return null;
  const lines: { kind: '+' | '-' | '~'; table: string; text: string; key: string }[] = [];
  for (const [table, d] of Object.entries(diff)) {
    if (!d) continue;
    for (const r of d.added) lines.push({ kind: '+', table, text: fmtRowInline(r), key: `${table}+${rowKey(r)}` });
    for (const r of d.removed) lines.push({ kind: '-', table, text: fmtRowInline(r), key: `${table}-${rowKey(r)}` });
    for (const c of d.changed) {
      const cells = c.columns.map((col) => `${col} ${String(c.before[col])} → ${String(c.after[col])}`).join(', ');
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
            'truncate rounded px-1.5',
            l.kind === '+' && 'sy-bg-green sy-text-green',
            l.kind === '-' && 'sy-bg-red sy-text-red',
            l.kind === '~' && 'sy-bg-amber sy-text-amber',
          )}
          title={`${l.table} ${l.text}`}
        >
          {l.kind} {l.table}: {l.text}
        </li>
      ))}
      {lines.length > max && <li className="px-1.5 text-muted-foreground">+{lines.length - max} more</li>}
    </ul>
  );
}
