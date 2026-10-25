'use client';
// Audit log (design/direction.md 7.5): mono timestamps, gate events as status pills, other actions as neutral
// chips, detail objects as compact key: value chips. Table on desktop, stacked rows on mobile.
import Link from 'next/link';
import { ScrollText } from 'lucide-react';
import type { AuditRow } from '@/lib/contracts/api';
import { getAudit } from '../api';
import { fmtDateTime, fmtPct, fmtRelative } from '../format';
import { EmptyState, ErrorState, StaleNotice, TableSkeleton } from '../states';
import { StatusPill } from '../status';
import { useData } from '../use-data';
import { Flap } from '../flap';

const POLL_MS = 10_000;
const GATE_ACTIONS = new Set(['live', 'blocked', 'error']);
const RATE_KEYS = new Set(['pass_rate', 'min_pass_rate']);

function ActionTag({ action }: { action: string }) {
  if (GATE_ACTIONS.has(action)) return <StatusPill status={action as 'live' | 'blocked' | 'error'} />;
  return <span className="status-word inline-block rounded-sm bg-board px-1.5 py-1 text-xs whitespace-nowrap text-board-ink">{action}</span>;
}

function Target({ target }: { target: string | null }) {
  if (!target) return <span className="text-muted-foreground">—</span>;
  const versioned = target.match(/^([a-z0-9][a-z0-9-]*)@v(\d+)$/i);
  if (versioned) {
    return (
      <Link href={`/agents/${encodeURIComponent(versioned[1])}/versions/${versioned[2]}`} className="text-link hover:underline">
        {target}
      </Link>
    );
  }
  if (/^[a-z0-9][a-z0-9-]*$/i.test(target)) {
    return (
      <Link href={`/agents/${encodeURIComponent(target)}`} className="text-link hover:underline">
        {target}
      </Link>
    );
  }
  // "agent-name:approval#741" -> link the agent part, keep the rest as text.
  const scoped = target.match(/^([a-z0-9][a-z0-9-]*):(.+)$/i);
  if (scoped) {
    return (
      <span>
        <Link href={`/agents/${encodeURIComponent(scoped[1])}`} className="text-link hover:underline">
          {scoped[1]}
        </Link>
        <span className="text-muted-foreground">:{scoped[2]}</span>
      </span>
    );
  }
  return <span>{target}</span>;
}

function fmtValue(key: string, v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (RATE_KEYS.has(key) && typeof v === 'number') return fmtPct(v);
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ') || '[]';
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function Detail({ detail }: { detail: unknown }) {
  if (detail === null || detail === undefined) return <span className="text-muted-foreground">—</span>;
  if (typeof detail !== 'object' || Array.isArray(detail)) {
    return <span className="font-mono text-xs break-words text-muted-foreground">{fmtValue('', detail)}</span>;
  }
  const entries = Object.entries(detail as Record<string, unknown>);
  const seeded = entries.some(([k, v]) => k === 'synthetic' && v === true);
  const shown = entries.filter(([k]) => k !== 'synthetic');
  if (shown.length === 0 && !seeded) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map(([k, v]) => {
        const text = fmtValue(k, v);
        return (
          <span key={k} className="inline-flex max-w-full items-baseline gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs" title={`${k}: ${text}`}>
            <span className="text-muted-foreground">{k}</span>
            <span className="truncate font-mono">{text}</span>
          </span>
        );
      })}
      {seeded && (
        <span className="rounded-sm px-1 py-0.5 text-xs text-muted-foreground" title="Seeded demo history, not a real event">
          seeded
        </span>
      )}
    </div>
  );
}

function When({ ts }: { ts: string }) {
  return (
    <time dateTime={ts} title={fmtRelative(ts)} className="font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
      {fmtDateTime(ts)}
    </time>
  );
}

function AuditTable({ rows }: { rows: AuditRow[] }) {
  return (
    <>
      <div className="panel hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/60 text-left">
            <tr>
              <th className="field-label px-4 py-2.5">When</th>
              <th className="field-label px-3 py-2.5">Actor</th>
              <th className="field-label px-3 py-2.5">Action</th>
              <th className="field-label px-3 py-2.5">Target</th>
              <th className="field-label px-3 py-2.5">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id} className="align-top transition-colors hover:bg-muted/60">
                <td className="px-4 py-2.5">
                  <When ts={r.ts} />
                </td>
                <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{r.actor || '—'}</td>
                <td className="px-3 py-2.5">
                  <ActionTag action={r.action} />
                </td>
                <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">
                  <Target target={r.target} />
                </td>
                <td className="max-w-md px-3 py-2.5">
                  <Detail detail={r.detail} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="panel divide-y overflow-hidden md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col gap-1.5 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <ActionTag action={r.action} />
              <span className="font-mono text-xs break-all">
                <Target target={r.target} />
              </span>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2 text-muted-foreground">
              <span className="font-semibold text-foreground">{r.actor || '—'}</span>
              <When ts={r.ts} />
            </div>
            <Detail detail={r.detail} />
          </li>
        ))}
      </ul>
    </>
  );
}

export function AuditView() {
  const { data, error, refetch } = useData('audit', getAudit, { pollMs: POLL_MS });
  const rows = data ? [...data].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)) : null;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="board-title text-3xl sm:text-4xl">Audit log</h1>
          {rows && <Flap text={String(rows.length)} tone="signal" className="text-[1.6rem]" label={`${rows.length} events`} />}
        </div>
        <p className="max-w-[70ch] text-muted-foreground">Every deploy, gate decision, rollback and approval, with who did it.</p>
        <StaleNotice error={data ? error : null} onRetry={refetch} />
      </header>
      {rows ? (
        rows.length === 0 ? (
          <EmptyState icon={<ScrollText />} title="No audit events yet">
            Deploys, gate verdicts, rollbacks and approval decisions are recorded here.
          </EmptyState>
        ) : (
          <AuditTable rows={rows} />
        )
      ) : error ? (
        <ErrorState title="Couldn't load the audit log" error={error} onRetry={refetch} />
      ) : (
        <TableSkeleton rows={8} cols={5} />
      )}
    </div>
  );
}
