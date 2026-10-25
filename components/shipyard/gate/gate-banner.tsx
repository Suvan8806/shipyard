'use client';
// Verdict banners for the gate board (design/direction.md 7.1 A) plus the running panel and the catch spotlight.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, ArrowUpRight, CircleCheck, CircleDashed, Lock, OctagonX, RotateCcw, ShieldAlert, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import type { GateResult, ScenarioResultSummary } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { deploy, errorMessage, rollback } from '../api';
import { MiniDiff } from './mini-diff';
import { isCriticalFail, shortName, type GateCounts } from './gate-model';

function servingSentence(current: number | null): string {
  return current ? `v${current} is still serving.` : 'Nothing was deployed.';
}

function BlockedBanner({ gate, counts, failing }: { gate: GateResult; counts: GateCounts; failing: ScenarioResultSummary | undefined }) {
  const sub = [
    `${counts.failed} of ${counts.total} tests failed`,
    counts.criticalFailed ? `${counts.criticalFailed} critical` : null,
    counts.errored ? `${counts.errored} hit infrastructure errors` : null,
  ].filter(Boolean);
  return (
    <div role="status" aria-live="polite" className="flex animate-banner-drop flex-col gap-4 rounded-lg bg-blocked-solid p-5 text-blocked-solid-foreground lg:flex-row lg:items-center">
      <Lock className="size-7 shrink-0" strokeWidth={1.75} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="status-word text-3xl xl:text-4xl">Blocked.</span>
          <span className="text-2xl font-medium">{servingSentence(gate.current_version)}</span>
        </p>
        <p className="mt-1.5 text-sm opacity-85">{sub.join(' · ')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="border-blocked-solid-foreground/60 bg-transparent text-blocked-solid-foreground hover:bg-blocked-solid-foreground/10 hover:text-blocked-solid-foreground"
          nativeButton={false}
          render={<Link href={`/agents/${gate.agent}`} />}
        >
          <ArrowLeft aria-hidden /> Back to editor
        </Button>
        {failing?.run_id && (
          <Button className="bg-blocked-solid-foreground text-blocked hover:bg-blocked-solid-foreground/90" nativeButton={false} render={<Link href={`/runs/${failing.run_id}`} />}>
            View failing run <ArrowUpRight aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}

function LiveBanner({ gate, counts }: { gate: GateResult; counts: GateCounts }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const serving = gate.current_version === gate.version;
  const doRollback = async () => {
    setBusy(true);
    try {
      const r = await rollback(gate.agent);
      toast.success(`Rolled back. v${r.current_version} is serving.`);
    } catch (e) {
      toast.error('Rollback failed', { description: errorMessage(e) });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };
  return (
    <div role="status" aria-live="polite" className="flex animate-banner-drop flex-col gap-4 rounded-lg border border-pass-border bg-pass-subtle p-5 lg:flex-row lg:items-center">
      <CircleCheck className="size-7 shrink-0 text-pass" strokeWidth={1.75} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="status-word text-3xl text-pass xl:text-4xl">Live.</span>
          <span className="text-2xl font-medium">
            {serving ? `v${gate.version} is now serving.` : `v${gate.version} passed the gate.${gate.current_version ? ` v${gate.current_version} is serving now.` : ''}`}
          </span>
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">Every critical end-state check passed on {counts.total} twins.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" nativeButton={false} render={<Link href={`/agents/${gate.agent}`} />}>
          Open agent
        </Button>
        {serving && gate.version > 1 &&
          (confirming ? (
            <Button variant="destructive" disabled={busy} onClick={doRollback}>
              <RotateCcw aria-hidden /> {busy ? 'Rolling back…' : 'Confirm rollback'}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              <RotateCcw aria-hidden /> Rollback
            </Button>
          ))}
      </div>
    </div>
  );
}

function ErrorBanner({ gate }: { gate: GateResult }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const again = async () => {
    setBusy(true);
    try {
      const r = await deploy(gate.agent);
      router.push(`/agents/${gate.agent}/versions/${r.version}`);
    } catch (e) {
      toast.error('Deploy failed', { description: errorMessage(e) });
      setBusy(false);
    }
  };
  return (
    <div role="status" aria-live="polite" className="flex animate-banner-drop flex-col gap-4 rounded-lg border border-warn-border bg-warn-subtle p-5 lg:flex-row lg:items-center">
      <TriangleAlert className="size-7 shrink-0 text-warn" strokeWidth={1.75} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-2xl font-medium">The gate couldn&apos;t finish. No version was changed.</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          This is an infrastructure error, not a verdict on the agent.{' '}
          {gate.current_version ? `v${gate.current_version} keeps serving.` : 'Nothing is serving yet.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" nativeButton={false} render={<Link href={`/agents/${gate.agent}`} />}>
          <ArrowLeft aria-hidden /> Back to editor
        </Button>
        <Button disabled={busy} onClick={again}>
          <RotateCcw aria-hidden /> {busy ? 'Starting…' : 'Run the gate again'}
        </Button>
      </div>
    </div>
  );
}

/** Calm progress panel. `stalled` = no tag has finished for a while (slow twins, rate limits). */
export function RunningPanel({ gate, counts, stalled }: { gate: GateResult; counts: GateCounts; stalled: boolean }) {
  const pct = counts.total ? (counts.done / counts.total) * 100 : 0;
  const finalizing = counts.total > 0 && counts.running === 0;
  const title =
    counts.total === 0
      ? 'Spinning up twins…'
      : finalizing
        ? 'All tests finished. Recording the verdict…'
        : stalled
          ? `Still running… ${counts.done}/${counts.total}`
          : `Testing v${gate.version} on ${counts.total} throwaway twin databases…`;
  return (
    <div role="status" className="rounded-lg border border-running-border bg-running-subtle p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex items-center gap-2 text-lg font-semibold sm:text-xl">
          <CircleDashed className="size-5 animate-running-ring text-running" strokeWidth={1.75} aria-hidden />
          {title}
        </p>
        <p className="font-mono text-lg font-semibold tabular-nums">
          {counts.done}/{counts.total}
        </p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background">
        <div className="h-full rounded-full bg-running-solid transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {stalled && !finalizing ? 'The slowest twins are still working. Results land here as they finish; you can leave this page and come back. ' : ''}
        {gate.current_version ? `v${gate.current_version} keeps serving members until every critical check passes.` : 'Nothing is serving yet, so members are unaffected.'}
      </p>
    </div>
  );
}

export function VerdictBanner({ gate, counts, results }: { gate: GateResult; counts: GateCounts; results: ScenarioResultSummary[] }) {
  if (gate.status === 'running') return null;
  if (gate.status === 'live') return <LiveBanner gate={gate} counts={counts} />;
  if (gate.status === 'error') return <ErrorBanner gate={gate} />;
  const failing = results.find(isCriticalFail) ?? results.find((r) => r.status === 'failed');
  return <BlockedBanner gate={gate} counts={counts} failing={failing} />;
}

/** The demo moment, blown up: reply check PASS next to end state FAIL, with the twin diff. */
export function CatchSpotlight({ r, more }: { r: ScenarioResultSummary; more: number }) {
  const failed = r.assertions.filter((a) => !a.passed);
  return (
    <section className="grid animate-banner-drop gap-5 rounded-lg border bg-card p-4 sm:p-5 lg:grid-cols-[1.1fr_1fr]" aria-label="What the gate caught">
      <div className="flex min-w-0 flex-col gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <ShieldAlert className="size-4" aria-hidden /> Caught by the end-state check
          {more > 0 && <span>· {more} more below</span>}
        </p>
        <h2 className="text-2xl font-semibold">{shortName(r)}</h2>
        {r.final_reply && <p className="rounded-md bg-muted p-3 text-sm leading-relaxed">&ldquo;{r.final_reply}&rdquo;</p>}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-fail-border bg-fail-subtle p-3">
            <div className="field-label">End state</div>
            <div className="status-word mt-1 flex items-center gap-1.5 text-3xl text-fail">
              <OctagonX className="size-6" aria-hidden /> Fail
            </div>
            {failed[0]?.assertion.label && <div className="mt-1 text-sm font-semibold text-fail">{failed[0].assertion.label}</div>}
          </div>
          <div className="rounded-md border p-3 text-muted-foreground">
            <div className="field-label">Reply check</div>
            <div className="status-word mt-1 flex items-center gap-1.5 text-xl">
              <CircleCheck className="size-5" aria-hidden /> Pass
            </div>
            {r.reply_check && <div className="mt-1 line-clamp-2 text-xs">&ldquo;{r.reply_check.rationale}&rdquo;</div>}
          </div>
        </div>
        <p className="flex items-center gap-1.5 rounded-md border border-fail-border bg-fail-subtle px-3 py-2 text-base font-semibold text-fail">
          <OctagonX className="size-4 shrink-0" aria-hidden /> A reply-only eval would have shipped this.
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">What actually changed in the data</p>
        {failed.map((a, i) => (
          <div key={i} className="rounded-md bg-muted p-3 font-mono text-sm">
            <div><span className="text-muted-foreground">expected </span>{a.expected}</div>
            <div><span className="text-muted-foreground">got&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><span className="font-semibold text-fail">{a.actual}</span></div>
          </div>
        ))}
        <MiniDiff diff={r.diff} max={6} className="text-sm" />
        {r.run_id && (
          <Button variant="outline" className={cn('self-start')} nativeButton={false} render={<Link href={`/runs/${r.run_id}`} />}>
            Open run trace and twin diff <ArrowUpRight aria-hidden />
          </Button>
        )}
      </div>
    </section>
  );
}
