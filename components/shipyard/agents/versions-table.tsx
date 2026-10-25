'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, GitBranch, GitCompare, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { AgentDetail, VersionSummary } from '@/lib/contracts/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { errorMessage, rollback } from '../api';
import { usePermission } from '../acting-as';
import { fmtCost, fmtDateTime, fmtPct } from '../format';
import { EmptyState } from '../states';
import { StatusPill } from '../status';

export const GATE_ERROR_COPY = "The gate couldn't finish. No version was changed.";

function RollbackButton({ name, team, target, onDone }: { name: string; team: string | null; target: number; onDone: () => void }) {
  const perm = usePermission('rollback', team);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      const r = await rollback(name);
      toast.success(`Rolled back. v${r.current_version} is serving.`);
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error('Rollback failed. Nothing changed.', { description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={!perm.allowed} title={perm.reason ?? undefined}>
        <RotateCcw aria-hidden /> Rollback
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Roll back {name}?</DialogTitle>
            <DialogDescription>
              Members will be served by the previous passing version (v{target}). You can deploy again at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirm()} disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />} Roll back to v{target}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function VersionRow({ d, v, rollbackTarget, onChanged }: { d: AgentDetail; v: VersionSummary; rollbackTarget: number | null; onChanged: () => void }) {
  const serving = v.version === d.current_version;
  const prevVersion = d.versions.find((x) => x.version < v.version)?.version ?? null;
  const href = `/agents/${encodeURIComponent(d.name)}/versions/${v.version}`;
  return (
    <tr className="hover:bg-accent">
      <td className="px-3 py-2.5 align-top">
        <Link href={href} className="font-mono font-semibold hover:underline">
          v{v.version}
        </Link>
        {serving && <span className="ml-2 text-xs font-semibold text-pass">serving</span>}
        {prevVersion !== null && (
          <Link
            href={`/agents/${encodeURIComponent(d.name)}/diff?from=${prevVersion}&to=${v.version}`}
            className="mt-1 flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <GitCompare className="size-3" aria-hidden /> Compare v{prevVersion}
          </Link>
        )}
      </td>
      <td className="px-3 py-2.5 align-top">
        <StatusPill status={v.status} />
        {v.status === 'error' && <p className="mt-1 max-w-56 text-xs text-muted-foreground">{GATE_ERROR_COPY}</p>}
      </td>
      <td className="px-3 py-2.5 text-right align-top font-mono tabular-nums">
        {v.status === 'running' ? <span className="text-muted-foreground">testing</span> : fmtPct(v.pass_rate)}
      </td>
      <td className="px-3 py-2.5 text-right align-top font-mono tabular-nums">{fmtCost(v.total_cost_usd, 3)}</td>
      <td className="px-3 py-2.5 align-top text-xs whitespace-nowrap text-muted-foreground">{fmtDateTime(v.started_at)}</td>
      <td className="px-3 py-2.5 text-right align-top whitespace-nowrap">
        {serving && rollbackTarget !== null ? (
          <RollbackButton name={d.name} team={d.team} target={rollbackTarget} onDone={onChanged} />
        ) : (
          <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Gate board <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </td>
    </tr>
  );
}

export function VersionsTable({ d, testCount, onChanged }: { d: AgentDetail; testCount: string; onChanged: () => void }) {
  if (d.versions.length === 0) {
    return (
      <EmptyState icon={<GitBranch />} title="Not deployed yet">
        Deploy runs the gate on {testCount} against throwaway twin databases. If every critical check passes, it goes live.
      </EmptyState>
    );
  }
  const previousLive = d.versions.find((x) => x.status === 'live' && d.current_version !== null && x.version < d.current_version);
  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="border-b bg-muted text-left">
          <tr>
            <th className="field-label px-3 py-2">Version</th>
            <th className="field-label px-3 py-2">Gate</th>
            <th className="field-label px-3 py-2 text-right">Pass rate</th>
            <th className="field-label px-3 py-2 text-right">Gate cost</th>
            <th className="field-label px-3 py-2">Started</th>
            <th className="px-3 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {d.versions.map((v) => (
            <VersionRow key={v.version} d={d} v={v} rollbackTarget={previousLive?.version ?? null} onChanged={onChanged} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
