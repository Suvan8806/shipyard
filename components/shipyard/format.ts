// Small display formatters shared by every dashboard screen.

export function fmtCost(usd: number | null | undefined, digits = 4): string {
  if (usd === null || usd === undefined || Number.isNaN(usd)) return '—';
  if (usd === 0) return '$0';
  return `$${usd.toFixed(usd >= 1 ? 2 : digits)}`;
}

export function fmtPct(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '—';
  const pct = rate * 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}

export function fmtDuration(ms: number): string {
  if (ms < 0) return '0s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

export function fmtRelative(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - Date.parse(iso));
  const s = Math.floor(diff / 1000);
  if (s < 45) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Compact one-line rendering of a DB row for diffs: `A-100 $25.00 "late fee goodwill"`. */
export function fmtRowInline(row: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(row)) {
    if (k === 'created_at' || k === 'decided_at' || k === 'id' || v === null || v === undefined) continue;
    if (k === 'amount' || k === 'balance') parts.push(`$${Number(v).toFixed(2)}`);
    else if (typeof v === 'string') parts.push(v.length > 48 ? `"${v.slice(0, 46)}…"` : /\s/.test(v) ? `"${v}"` : v);
    else if (typeof v === 'object') continue;
    else parts.push(`${k}=${String(v)}`);
  }
  return parts.join(' ');
}
