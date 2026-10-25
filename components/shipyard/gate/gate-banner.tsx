'use client';
// Verdict boards for the gate board (the Departures signature at page scale), the running board, and the catch spotlight.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, CircleCheck, CircleDashed, GitCompare, Lock, OctagonX, RotateCcw, ShieldAlert, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import type { GateResult, ScenarioResultSummary } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { deploy, errorMessage, rollback } from '../api';
import { Flap } from '../flap';
import { MiniDiff } from './mini-diff';
import { isCriticalFail, pickSpotlight, shortName, verdicts, type GateCounts } from './gate-model';

/**
 * What is serving, worded for this version's gate. `current_version` is the version serving NOW, so on an older
 * gate (current newer than this version) it did not exist at gate time: say "Currently serving" instead.
 */
/** Secondary actions on a board-black surface. */
const BOARD_BTN =
  'border-board-rule bg-board-raised text-board-ink hover:bg-board-cell hover:text-board-ink dark:bg-board-raised dark:hover:bg-board-cell';

function servingSentence(current: number | null, version: number): string {
  if (!current) return 'Nothing is serving.';
  return current < version ? `v${current} is still serving.` : `Currently serving: v${current}.`;
}

function BlockedBanner({
  gate,
  counts,
  failing,
  landed,
}: {
  gate: GateResult;
  counts: GateCounts;
  failing: ScenarioResultSummary | undefined;
  landed: boolean;
}) {
  // Blocked with zero failures means the gate could not verify the version (provider errors). Say that, not "0 failed".
  const unverified = counts.failed === 0 && counts.errored > 0;
  const sub = unverified
    ? [
        `${counts.errored} of ${counts.total} tests couldn't be graded (infrastructure errors)`,
        'the gate only ships what it can verify',
      ]
    : [
        `${counts.failed} of ${counts.total} ${counts.total === 1 ? 'test' : 'tests'} failed on the data`,
        counts.criticalFailed ? `${counts.criticalFailed} critical` : null,
        counts.errored ? `${counts.errored} not graded` : null,
      ].filter(Boolean);
  return (
    <div role="status" aria-live="polite" className={cn('board relative overflow-hidden', landed && 'board-land')}>
      {/* the cancelled-departure strip: a red band that sweeps across when the verdict lands */}
      <div className={cn('h-2 bg-fail-solid', landed && 'rule-sweep')} aria-hidden />
      <div className="flex flex-col gap-5 p-5 sm:p-7 xl:flex-row xl:items-center xl:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <span className="grid size-14 shrink-0 place-items-center rounded-md bg-fail-solid text-fail-solid-foreground" aria-hidden>
              <Lock className="size-7" strokeWidth={2.25} />
            </span>
            <Flap text="Blocked" tone="blocked" animate={landed} className="text-[2.6rem] sm:text-5xl" />
          </div>
          <p className="board-title text-[1.9rem] leading-tight text-board-ink sm:text-4xl">{servingSentence(gate.current_version, gate.version)}</p>
          <p className="text-base text-board-muted sm:text-lg">{sub.join(' · ')}</p>
        </div>
        <div className="flex flex-wrap gap-2 xl:max-w-[27rem] xl:justify-end">
          <Button variant="outline" className={BOARD_BTN} nativeButton={false} render={<Link href={`/agents/${gate.agent}`} />}>
            <ArrowLeft aria-hidden /> Back to editor
          </Button>
          {gate.current_version !== null && gate.current_version !== gate.version && (
            <Button
              variant="outline"
              className={BOARD_BTN}
              nativeButton={false}
              render={<Link href={`/agents/${gate.agent}/diff?from=${gate.current_version}&to=${gate.version}`} />}
            >
              <GitCompare aria-hidden /> What changed vs v{gate.current_version}?
            </Button>
          )}
          {failing?.run_id && (
            <Button nativeButton={false} render={<Link href={`/runs/${failing.run_id}`} />}>
              View failing run <ArrowUpRight aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function LiveBanner({ gate, counts, landed }: { gate: GateResult; counts: GateCounts; landed: boolean }) {
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
    <div role="status" aria-live="polite" className={cn('board relative overflow-hidden', landed && 'board-land')}>
      <div className={cn('h-2 bg-pass-solid', landed && 'rule-sweep')} aria-hidden />
      <div className="flex flex-col gap-5 p-5 sm:p-7 xl:flex-row xl:items-center xl:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <span className="grid size-14 shrink-0 place-items-center rounded-md bg-pass-solid text-pass-solid-foreground" aria-hidden>
              <CircleCheck className="size-7" strokeWidth={2.25} />
            </span>
            <Flap text="Live" tone="pass" animate={landed} className="text-[2.6rem] sm:text-5xl" />
          </div>
          <p className="board-title text-[1.9rem] leading-tight text-board-ink sm:text-4xl">
            {serving ? `v${gate.version} is now serving.` : `v${gate.version} passed the gate.${gate.current_version ? ` v${gate.current_version} is serving now.` : ''}`}
          </p>
          <p className="text-base text-board-muted sm:text-lg">Every critical end-state check passed on {counts.total} twins.</p>
        </div>
        <div className="flex flex-wrap gap-2 xl:justify-end">
          <Button variant="outline" className={BOARD_BTN} nativeButton={false} render={<Link href={`/agents/${gate.agent}`} />}>
            Open agent
          </Button>
          {serving && gate.version > 1 &&
            (confirming ? (
              <Button className="bg-fail-solid text-fail-solid-foreground hover:bg-fail-solid/90" disabled={busy} onClick={doRollback}>
                <RotateCcw aria-hidden /> {busy ? 'Rolling back…' : 'Confirm rollback'}
              </Button>
            ) : (
              <Button variant="outline" className={BOARD_BTN} onClick={() => setConfirming(true)}>
                <RotateCcw aria-hidden /> Rollback
              </Button>
            ))}
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({ gate, landed }: { gate: GateResult; landed: boolean }) {
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
    <div role="status" aria-live="polite" className={cn('board relative overflow-hidden', landed && 'board-land')}>
      <div className="h-2 bg-warn-solid" aria-hidden />
      <div className="flex flex-col gap-5 p-5 sm:p-7 xl:flex-row xl:items-center xl:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <span className="grid size-14 shrink-0 place-items-center rounded-md bg-warn-solid text-warn-solid-foreground" aria-hidden>
              <TriangleAlert className="size-7" strokeWidth={2.25} />
            </span>
            <Flap text="Error" tone="warn" animate={landed} className="text-[2.6rem] sm:text-5xl" />
          </div>
          <p className="board-title text-[1.9rem] leading-tight text-board-ink sm:text-4xl">The gate couldn&apos;t finish. No version was changed.</p>
          <p className="text-base text-board-muted sm:text-lg">
            This is an infrastructure error, not a verdict on the agent.{' '}
            {gate.current_version ? `v${gate.current_version} keeps serving.` : 'Nothing is serving yet.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 xl:justify-end">
          <Button variant="outline" className={BOARD_BTN} nativeButton={false} render={<Link href={`/agents/${gate.agent}`} />}>
            <ArrowLeft aria-hidden /> Back to editor
          </Button>
          <Button disabled={busy} onClick={again}>
            <RotateCcw aria-hidden /> {busy ? 'Starting…' : 'Run the gate again'}
          </Button>
        </div>
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
    <div role="status" className="board overflow-hidden">
      <div className="h-2 overflow-hidden bg-board-raised" aria-hidden>
        <div className="h-full bg-running-solid transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-col gap-3 p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="grid size-14 shrink-0 place-items-center rounded-md bg-running-solid text-running-solid-foreground" aria-hidden>
              <CircleDashed className="size-7 animate-running-ring" strokeWidth={2.25} />
            </span>
            <Flap text="Running" tone="running" className="text-[2.6rem] sm:text-5xl" />
          </div>
          <Flap
            text={`${counts.done}/${counts.total}`}
            tone="running"
            className="text-[2.2rem] sm:text-[2.6rem]"
            label={`${counts.done} of ${counts.total} tests finished`}
          />
        </div>
        <p className="board-title text-2xl leading-tight text-board-ink sm:text-3xl">{title}</p>
        <p className="text-base text-board-muted">
          {stalled && !finalizing ? 'The slowest twins are still working. Results land here as they finish; you can leave this page and come back. ' : ''}
          {gate.current_version ? `v${gate.current_version} keeps serving members until every critical check passes.` : 'Nothing is serving yet, so members are unaffected.'}
        </p>
      </div>
    </div>
  );
}

/** True once the gate has left `running` while this page watched. Cold loads of a finished gate never animate. */
function useLanded(status: GateResult['status']): boolean {
  const sawRunning = useRef(status === 'running');
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (status === 'running') sawRunning.current = true;
    else if (sawRunning.current) {
      sawRunning.current = false;
      setLanded(true);
    }
  }, [status]);
  return landed;
}

export function VerdictBanner({ gate, counts, results }: { gate: GateResult; counts: GateCounts; results: ScenarioResultSummary[] }) {
  const landed = useLanded(gate.status);
  if (gate.status === 'running') return null;
  if (gate.status === 'live') return <LiveBanner gate={gate} counts={counts} landed={landed} />;
  if (gate.status === 'error') return <ErrorBanner gate={gate} landed={landed} />;
  const failing = pickSpotlight(results);
  return <BlockedBanner gate={gate} counts={counts} failing={failing} landed={landed} />;
}

/** Reply check verdict for the spotlight: Pass (muted, it is the misleading half), Fail, or Not graded. */
function ReplyVerdict({ r }: { r: ScenarioResultSummary }) {
  const v = verdicts(r);
  if (v.reply === null) {
    return (
      <div className="status-word mt-2 flex items-center gap-1.5 text-2xl text-muted-foreground">
        <CircleDashed className="size-5" aria-hidden /> Not graded
      </div>
    );
  }
  return (
    <div className={cn('status-word mt-2 flex items-center gap-1.5 text-2xl', v.reply ? 'text-muted-foreground' : 'text-fail')}>
      {v.reply ? <CircleCheck className="size-5" aria-hidden /> : <OctagonX className="size-5" aria-hidden />}
      {v.reply ? 'Pass' : 'Fail'}
    </div>
  );
}

/**
 * The demo moment, blown up: the end-state FAIL next to the reply check, with the proof (expected vs got, twin diff).
 * Shown for the most telling failure: a reply-vs-data disagreement first, else the first critical failure.
 */
export function CatchSpotlight({ r, more }: { r: ScenarioResultSummary; more: number }) {
  const failed = r.assertions.filter((a) => !a.passed);
  const v = verdicts(r);
  const crit = isCriticalFail(r);
  return (
    <section className="panel grid overflow-hidden lg:grid-cols-[1.15fr_1fr]" aria-label="What the gate caught">
      <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-muted-foreground">
          <ShieldAlert className="size-4 text-fail" aria-hidden />
          <span>Caught by the end-state check</span>
          {crit && (
            <span className="status-word rounded-sm bg-fail-solid px-1.5 py-1 text-xs text-fail-solid-foreground">Critical</span>
          )}
          {more > 0 && <span className="font-normal">· {more} more below</span>}
        </p>
        <h2 className="board-title text-3xl break-words sm:text-4xl">{shortName(r)}</h2>
        {r.final_reply && (
          <blockquote className="rounded-md border bg-muted/60 p-3 text-base leading-relaxed">
            <span className="field-label mb-1 block">The agent said</span>&ldquo;{r.final_reply}&rdquo;
          </blockquote>
        )}
        {/* End state decides; it gets the board and the big flap. The reply check is the quiet half. */}
        <div className="grid gap-3 sm:grid-cols-[1.35fr_1fr]">
          <div className="board flex flex-col gap-2 p-4 shadow-none">
            <div className="flex items-center justify-between gap-2">
              <span className="field-label text-board-muted">End state</span>
              <span className="text-xs font-bold text-board-muted">decides the gate</span>
            </div>
            <div className="flex items-center gap-3">
              <OctagonX className="size-9 shrink-0 text-fail-lamp" strokeWidth={2.25} aria-hidden />
              <Flap text="Fail" tone="fail" className="text-5xl" />
            </div>
            {failed[0]?.assertion.label && <div className="text-base font-bold text-board-ink">{failed[0].assertion.label}</div>}
          </div>
          <div className="rounded-md border border-dashed p-4">
            <div className="field-label">Reply check</div>
            <ReplyVerdict r={r} />
            {r.reply_check?.rationale ? (
              <div className="mt-2 line-clamp-2 text-sm text-muted-foreground">&ldquo;{r.reply_check.rationale}&rdquo;</div>
            ) : (
              <div className="mt-2 text-sm text-muted-foreground">Informational only. Never decides the gate.</div>
            )}
          </div>
        </div>
        {v.disagree && (
          <p className="flex items-center gap-2 rounded-md bg-fail-solid px-4 py-3 text-lg font-bold text-fail-solid-foreground">
            <OctagonX className="size-5 shrink-0" strokeWidth={2.25} aria-hidden /> A reply-only eval would have shipped this.
          </p>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-3 border-t bg-muted/50 p-4 sm:p-6 lg:border-t-0 lg:border-l">
        <h3 className="board-title text-2xl">What actually changed in the data</h3>
        {failed.map((a, i) => (
          <div key={i} className="rounded-md border bg-card p-3 font-mono text-[0.9375rem]">
            {a.assertion.label && <div className="mb-1.5 font-sans font-bold">{a.assertion.label}</div>}
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5">
              <span className="text-muted-foreground">expected</span>
              <span className="break-words">{a.expected}</span>
              <span className="text-muted-foreground">got</span>
              <span className="text-xl font-bold break-words text-fail">{a.actual}</span>
            </div>
          </div>
        ))}
        <div>
          <span className="field-label mb-1.5 block">Twin diff</span>
          <MiniDiff diff={r.diff} max={6} className="text-sm" />
        </div>
        {r.run_id && (
          <Button variant="outline" className="mt-auto self-start" nativeButton={false} render={<Link href={`/runs/${r.run_id}`} />}>
            Open run trace and twin diff <ArrowUpRight aria-hidden />
          </Button>
        )}
      </div>
    </section>
  );
}
