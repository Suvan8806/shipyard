'use client';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { getAudit } from '../api';
import { fmtDateTime } from '../format';
import { useData } from '../use-data';

function actionClass(action: string): string {
  if (action === 'blocked' || action.endsWith('rejected')) return 'sy-pill-red';
  if (action === 'live' || action.endsWith('approved')) return 'sy-pill-green';
  if (action === 'deploy' || action === 'rollback' || action === 'simulate') return 'sy-pill-amber';
  return 'sy-pill-grey';
}

function targetHref(target: string | null): string | null {
  const m = target?.match(/^([a-z0-9-]+)@v(\d+)$/);
  if (m) return `/agents/${m[1]}/versions/${m[2]}`;
  if (target && /^[a-z0-9-]+-agent$/.test(target)) return `/agents/${target}`;
  return null;
}

export function AuditView() {
  const { data, error } = useData('audit', getAudit, { pollMs: 5000 });
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Audit log</h1>
        <p className="text-muted-foreground">Every deploy, gate decision, rollback and approval, with who did it.</p>
      </header>
      {error && <p className="sy-pill-red rounded-xl border p-4 text-sm">{error.message}</p>}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">When</th>
              <th className="px-3 py-2.5 font-medium">Actor</th>
              <th className="px-3 py-2.5 font-medium">Action</th>
              <th className="px-3 py-2.5 font-medium">Target</th>
              <th className="px-3 py-2.5 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!data &&
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i}>
                  <td colSpan={5} className="px-4 py-3">
                    <div className="h-5 animate-pulse rounded bg-muted" />
                  </td>
                </tr>
              ))}
            {(data ?? []).map((r) => {
              const href = targetHref(r.target);
              return (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(r.ts)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.actor}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn('rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap', actionClass(r.action))}>{r.action}</span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">
                    {href ? (
                      <Link href={href} className="hover:underline">
                        {r.target}
                      </Link>
                    ) : (
                      r.target
                    )}
                  </td>
                  <td className="max-w-md px-3 py-2.5 font-mono text-[11px] break-words text-muted-foreground">{JSON.stringify(r.detail)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
