'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, OctagonX, PlayCircle, RotateCcw, ShieldAlert, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import type { GateResult, ScenarioResultSummary } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getGate, replayGate, rollback, USE_MOCKS } from '../api';
import { fmtCost, fmtDuration, fmtPct } from '../format';
import { StatusPill } from '../status';
import { useData, useNow } from '../use-data';
import { GateCard, shortName, verdicts } from './gate-card';
import { MiniDiff } from './mini-diff';

type Filter = 'all' | 'failed' | 'critical';

interface Group {
  key: string;
  title: string;
  subtitle: string;
  results: ScenarioResultSummary[];
}

function groupResults(results: ScenarioResultSummary[]): Group[] {
  const spec = results.filter((r) => r.source === 'spec');
  const gen = results.filter((r) => r.source === 'generated');
  const packs = new Map<string, ScenarioResultSummary[]>();
  for (const r of results) {
    if (r.source !== 'pack') continue;
    const name = r.pack ?? 'pack';
    packs.set(name, [...(packs.get(name) ?? []), r]);
  }
  const groups: Group[] = [];
  if (spec.length) groups.push({ key: 'spec', title: 'From the spec', subtitle: 'hand-written scenarios', results: spec });
  for (const [name, rs] of packs) groups.push({ key: `pack:${name}`, title: name, subtitle: 'shared test pack', results: rs });
  if (gen.length) groups.push({ key: 'generated', title: 'Generated', subtitle: 'LLM-proposed, human-accepted', results: gen });
  return groups;
}

const hasCritical = (r: ScenarioResultSummary) => r.assertions.some((a) => a.critical) || r.status === 'running';

function Stat({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('text-xl font-semibold tabular-nums sm:text-2xl', mono && 'font-mono')}>{value}</div>
    </div>
  );
}

function Banner({ gate, onRollback }: { gate: GateResult; onRollback: () => void }) {
  const failedCritical = gate.results.filter((r) => r.status !== 'passed' && r.assertions.some((a) => !a.passed && a.critical));
  if (gate.status === 'running') {
    const done = gate.results.filter((r) => r.status !== 'running').length;
    const pct = gate.results.length ? (done / gate.results.length) * 100 : 0;
    return (
      <div className="sy-pill-amber rounded-2xl border p-4 sm:p-5" role="status">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-lg font-semibold sm:text-2xl">
            Testing v{gate.version} on {gate.results.length} throwaway twin databases…
          </p>
          <p className="font-mono text-lg font-semibold tabular-nums sm:text-2xl">
            {done}/{gate.results.length}
          </p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-background/60">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: 'var(--sy-amber)' }} />
        </div>
        <p className="mt-2 text-sm opacity-80">
          {gate.current_version ? `v${gate.current_version} keeps serving members until every critical check passes.` : 'Nothing is serving yet.'}
        </p>
      </div>
    );
  }
  if (gate.status === 'live') {
    return (
      <div className="sy-banner-in sy-pill-green flex flex-wrap items-center gap-3 rounded-2xl border-2 p-4 sm:p-6" role="status">
        <Check className="size-8 shrink-0 sm:size-10" aria-hidden />
        <div>
          <p className="text-2xl font-bold tracking-tight sm:text-4xl">Live. v{gate.version} is now serving.</p>
          <p className="mt-1 text-sm opacity-80">Every critical end-state check passed on {gate.results.length} twins.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="sy-banner-in sy-pill-red flex flex-col gap-4 rounded-2xl border-2 p-4 sm:flex-row sm:items-center sm:p-6" role="alert">
      <OctagonX className="size-10 shrink-0 sm:size-12" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-3xl font-bold tracking-tight sm:text-5xl">
          Blocked. {gate.current_version ? `v${gate.current_version} is still serving.` : 'Nothing was deployed.'}
        </p>
        <p className="mt-1.5 text-sm sm:text-base opacity-90">
          {failedCritical.length} critical end-state {failedCritical.length === 1 ? 'check' : 'checks'} failed
          {failedCritical.length > 0 && <>: <span className="font-mono">{failedCritical.map((r) => shortName(r)).join(', ')}</span></>}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" nativeButton={false} render={<Link href={`/agents/${gate.agent}`} />}>
          <ArrowLeft /> Back to editor
        </Button>
        <Button variant="outline" onClick={onRollback}>
          <RotateCcw /> Rollback
        </Button>
      </div>
    </div>
  );
}

/** The demo moment, blown up: reply check PASS next to end state FAIL, with the twin diff. */
function CatchSpotlight({ r }: { r: ScenarioResultSummary }) {
  const failed = r.assertions.filter((a) => !a.passed);
  return (
    <section className="sy-banner-in grid gap-4 rounded-2xl border bg-card p-4 sm:p-6 lg:grid-cols-[1.1fr_1fr]" aria-label="What the gate caught">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <ShieldAlert className="size-4" aria-hidden /> Caught by the end-state check
        </div>
        <h2 className="font-mono text-xl font-semibold sm:text-2xl">{shortName(r)}</h2>
        {r.final_reply && (
          <blockquote className="rounded-xl border-l-4 bg-muted/50 p-3 text-sm italic leading-relaxed sm:text-base" style={{ borderLeftColor: 'var(--sy-green-border)' }}>
            “{r.final_reply}”
          </blockquote>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border p-3">
            <div className="text-xs text-muted-foreground">Reply check (LLM judge)</div>
            <div className="mt-1 flex items-center gap-1.5 font-mono text-2xl font-semibold text-muted-foreground sm:text-3xl">
              PASS <Check className="size-6" aria-hidden />
            </div>
            {r.reply_check && <div className="mt-1 text-xs text-muted-foreground">“{r.reply_check.rationale}”</div>}
          </div>
          <div className="sy-pill-red rounded-xl border-2 p-3">
            <div className="text-xs opacity-80">End state (twin database)</div>
            <div className="mt-1 flex items-center gap-1.5 font-mono text-2xl font-bold sm:text-3xl">
              FAIL <X className="size-6" aria-hidden />
            </div>
            {failed[0] && <div className="mt-1 text-xs font-semibold">{failed[0].assertion.label}</div>}
          </div>
        </div>
        <p className="sy-pill-red rounded-xl border px-3 py-2 text-base font-bold sm:text-lg">A reply-only eval would have shipped this.</p>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What actually changed in the data</div>
        {failed.map((a, i) => (
          <div key={i} className="rounded-xl bg-muted/60 p-3 font-mono text-sm">
            <div><span className="text-muted-foreground">expected </span>{a.expected}</div>
            <div><span className="text-muted-foreground">actual&nbsp;&nbsp;&nbsp;</span><span className="sy-text-red font-bold">{a.actual}</span></div>
          </div>
        ))}
        <MiniDiff diff={r.diff} max={6} className="text-sm" />
        {r.run_id && (
          <Button variant="outline" className="self-start" nativeButton={false} render={<Link href={`/runs/${r.run_id}`} />}>
            Open run trace + twin diff <ArrowUpRight />
          </Button>
        )}
      </div>
    </section>
  );
}

function CoverageChip({ gate }: { gate: GateResult }) {
  const cov = gate.coverage;
  if (!cov) return null;
  const untested = cov.tools_untested;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span
        className={cn('rounded-full border px-2.5 py-1 font-semibold', untested.length ? 'sy-pill-amber' : 'sy-pill-green')}
        title={untested.length ? `Untested: ${untested.join(', ')}` : `Tested: ${cov.tools_tested.join(', ')}`}
      >
        {untested.length ? `${untested.length} untested: ${untested.join(', ')}` : `All ${cov.tools_tested.length} tools tested`}
      </span>
      <span className="rounded-full border px-2.5 py-1 text-muted-foreground" title={cov.policies_tested.join('\n')}>
        {cov.policies_tested.length} policies exercised
      </span>
      <span className="rounded-full border px-2.5 py-1 text-muted-foreground">
        tables checked: <span className="font-mono">{cov.tables_checked.join(', ')}</span>
      </span>
    </div>
  );
}

export function GateBoard({ name, version }: { name: string; version: number }) {
  const [nonce, setNonce] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const { data: gate, error } = useData(`${name}@${version}#${nonce}`, () => getGate(name, version), {
    pollMs: 1000,
    shouldPoll: (g) => !g || g.status === 'running',
  });
  const running = gate?.status === 'running';
  const now = useNow(1000, running);

  const results = useMemo(() => gate?.results ?? [], [gate]);
  const groups = useMemo(() => {
    const visible = results.filter((r) =>
      filter === 'failed' ? r.status === 'failed' || r.status === 'error' : filter === 'critical' ? hasCritical(r) : true,
    );
    return groupResults(visible);
  }, [results, filter]);
  const catches = results.filter((r) => verdicts(r).disagree);
  const packCount = new Set(results.filter((r) => r.source === 'pack').map((r) => r.pack)).size;
  const passed = results.filter((r) => r.status === 'passed').length;
  const failedCount = results.filter((r) => r.status === 'failed' || r.status === 'error').length;

  if (error) {
    return (
      <div className="sy-pill-red rounded-xl border p-6">
        <p className="font-semibold">Could not load the gate for {name} v{version}.</p>
        <p className="text-sm">{error.message}</p>
      </div>
    );
  }
  if (!gate) return <GateBoardSkeleton />;

  const elapsed = (gate.finished_at ? Date.parse(gate.finished_at) : now) - Date.parse(gate.started_at);

  const doRollback = async () => {
    try {
      const r = await rollback(name);
      toast.success(`Rolled back. v${r.current_version} is serving.`);
    } catch (e) {
      toast.error('Rollback failed', { description: e instanceof Error ? e.message : String(e) });
    }
  };
  const doReplay = async () => {
    await replayGate(name, version);
    setNonce((n) => n + 1);
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link href={`/agents/${name}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> {name}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {name} <span className="text-muted-foreground">v{gate.version}</span>
          </h1>
          <StatusPill status={gate.status} size="lg" />
          {USE_MOCKS && !running && (
            <Button variant="ghost" size="sm" className="ml-auto" onClick={doReplay}>
              <PlayCircle /> Replay gate
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-4">
          <Stat label="Pass rate" value={gate.pass_rate === null ? `${passed}/${results.length}` : `${fmtPct(gate.pass_rate)}`} />
          <Stat label="Passed / failed" value={`${passed} / ${failedCount}`} />
          <Stat label="Total cost" value={fmtCost(gate.total_cost_usd, 3)} />
          <Stat label={running ? 'Elapsed' : 'Took'} value={fmtDuration(elapsed)} />
        </div>
      </header>

      <Banner gate={gate} onRollback={doRollback} />

      {catches.map((r) => (
        <CatchSpotlight key={r.scenario} r={r} />
      ))}

      <section className="flex flex-col gap-4" aria-label="All tests">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-lg font-semibold tabular-nums">
              {results.length} tests · {packCount} packs · {gate.coverage ? gate.coverage.tools_untested.length : '…'} untested tools
            </p>
            <CoverageChip gate={gate} />
          </div>
          <div className="inline-flex self-start rounded-lg border p-0.5 text-sm" role="tablist" aria-label="Filter tests">
            {(
              [
                ['all', `All ${results.length}`],
                ['failed', `Failed ${failedCount}`],
                ['critical', 'Critical only'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={filter === key}
                onClick={() => setFilter(key)}
                className={cn(
                  'rounded-md px-3 py-1.5 font-medium transition-colors',
                  filter === key ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {groups.length === 0 && (
          <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            {filter === 'failed' ? 'No failures. Every end-state check passed.' : 'No tests match this filter.'}
          </p>
        )}
        {groups.map((g) => {
          const gFailed = g.results.filter((r) => r.status === 'failed' || r.status === 'error').length;
          const gDone = g.results.filter((r) => r.status !== 'running').length;
          return (
            <div key={g.key} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <h2 className="flex items-center gap-1.5 text-base font-semibold">
                  {g.key === 'generated' && <Sparkles className="size-4 text-[var(--sy-accent)]" aria-hidden />}
                  {g.title}
                </h2>
                <span className="text-xs text-muted-foreground">{g.subtitle}</span>
                <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                  {gDone}/{g.results.length}
                  {gFailed > 0 && <span className="sy-text-red font-semibold"> · {gFailed} failed</span>}
                </span>
              </div>
              <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {g.results.map((r) => (
                  <GateCard key={r.scenario} r={r} />
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

export function GateBoardSkeleton() {
  return (
    <div className="mx-auto flex max-w-7xl animate-pulse flex-col gap-6">
      <div className="h-10 w-72 rounded-lg bg-muted" />
      <div className="h-24 rounded-2xl bg-muted" />
      <div className="h-28 rounded-2xl bg-muted" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-32 rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
