'use client';
// Stress lab /agents/[name]/stress: launch a reliability run, a red-team swarm or a model matrix (all dry runs),
// with the cost shown before anything is spent, plus the agent's recent stress runs.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowRight, Check, CircleCheck, CircleDashed, History, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAgent, getBudget, getGate, getLibrary, listStress, startStress } from '../api';
import { fmtDateTime } from '../format';
import { EmptyState, ErrorState, Skeleton, StaleNotice } from '../states';
import { useData } from '../use-data';
import type { StressSummary } from './contract';
import {
  budgetLeft,
  clamp,
  DEFAULT_TEST_COUNT,
  estimateCost,
  FALLBACK_MODELS,
  MATRIX_MODELS,
  plannedRuns,
  REDTEAM_COUNT,
  RELIABILITY_RUNS,
  shortModel,
} from './estimate';
import { LaunchCard, NumberStepper } from './launch-card';
import { BackLink, isNotDeployed, MODE_META, NotDeployed, PageTitle } from './shared';

const LIST_POLL_MS = 3000;

/** Tests in the agent's latest gate (what a reliability / matrix run will execute). */
function useTestCount(name: string): { tests: number; known: boolean } {
  const { data } = useData(`stress-tests:${name}`, async () => {
    const d = await getAgent(name);
    const latest = d.versions[0];
    if (!latest) return null;
    const g = await getGate(name, latest.version);
    return g.scenario_names.length || g.results.length || null;
  });
  return { tests: data ?? DEFAULT_TEST_COUNT, known: data != null };
}

/** Library profile models first (careful, fast), then the fallback chain; deduped. */
function useModelOptions(): { options: string[]; defaults: string[] } {
  const { data: lib } = useData('library', getLibrary);
  return useMemo(() => {
    const profiles = lib?.profiles ?? {};
    const careful = profiles.careful?.model;
    const fast = profiles.fast?.model;
    const others = Object.values(profiles).map((p) => p.model);
    const options = [...new Set([careful, fast, ...others, ...FALLBACK_MODELS].filter((m): m is string => !!m))];
    const defaults = [...new Set([careful, fast, FALLBACK_MODELS.find((m) => m.startsWith('groq/'))].filter((m): m is string => !!m))];
    const picked = (defaults.length >= MATRIX_MODELS.min ? defaults : options).slice(0, MATRIX_MODELS.max);
    return { options, defaults: picked };
  }, [lib]);
}

function ModelPicker({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (m: string) => {
    if (value.includes(m)) onChange(value.filter((x) => x !== m));
    else if (value.length < MATRIX_MODELS.max) onChange([...value, m]);
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="field-label mb-2">
        Models · pick {MATRIX_MODELS.min} to {MATRIX_MODELS.max}
      </legend>
      <ul className="flex flex-col gap-1.5">
        {options.map((m) => {
          const on = value.includes(m);
          const full = !on && value.length >= MATRIX_MODELS.max;
          return (
            <li key={m}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={full}
                onClick={() => toggle(m)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                  on ? 'border-primary bg-accent' : 'bg-card hover:bg-muted',
                  full && 'opacity-50',
                )}
              >
                <span
                  className={cn(
                    'grid size-4 shrink-0 place-items-center rounded-sm border',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                  )}
                  aria-hidden
                >
                  {on && <Check className="size-3" strokeWidth={2.5} />}
                </span>
                <span className="font-mono font-semibold">{shortModel(m)}</span>
                <span className="ml-auto truncate font-mono text-xs text-muted-foreground">{m.split('/')[0]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

function RecentRow({ name, s }: { name: string; s: StressSummary }) {
  const meta = MODE_META[s.mode];
  return (
    <li>
      <Link
        href={`/agents/${encodeURIComponent(name)}/stress/${encodeURIComponent(s.stress_id)}`}
        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-accent"
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold sm:w-36">
          <meta.Icon className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          {meta.label}
        </span>
        <span className="order-last min-w-0 basis-full text-sm sm:order-none sm:basis-0 sm:flex-1">
          {s.status === 'running' ? (
            <span className="inline-flex items-center gap-1.5 text-running">
              <CircleDashed className="size-4 animate-running-ring" aria-hidden /> {s.headline || 'Running…'}
            </span>
          ) : s.status === 'error' ? (
            <span className="inline-flex items-center gap-1.5 text-warn">
              <TriangleAlert className="size-4" aria-hidden /> {s.headline || "The stress run couldn't finish."}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <CircleCheck className="size-4 text-muted-foreground" aria-hidden /> {s.headline}
            </span>
          )}
        </span>
        <span className="ml-auto text-xs whitespace-nowrap text-muted-foreground sm:ml-0">{fmtDateTime(s.created_at)}</span>
        <ArrowRight className="size-4 text-link" aria-hidden />
      </Link>
    </li>
  );
}

function RecentRuns({ name }: { name: string }) {
  const { data, error, loading, refetch } = useData(`stress-list:${name}`, () => listStress(name), {
    pollMs: LIST_POLL_MS,
    shouldPoll: (x) => !!x?.some((s) => s.status === 'running'),
  });
  if (loading && !data) return <Skeleton className="h-40" />;
  if (error && !data) return isNotDeployed(error) ? null : <ErrorState title="Couldn't load recent stress runs" error={error} onRetry={refetch} />;
  if (!data || data.length === 0) {
    return (
      <EmptyState icon={<History />} title="No stress runs yet">
        Start one above. Each run is a dry run against throwaway twins; the live version never changes.
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <StaleNotice error={error} onRetry={refetch} />
      <ul className="divide-y overflow-hidden panel">
        {data.map((s) => (
          <RecentRow key={s.stress_id} name={name} s={s} />
        ))}
      </ul>
    </div>
  );
}

export function StressLab({ name }: { name: string }) {
  const router = useRouter();
  const enc = encodeURIComponent(name);
  const probe = useData(`stress-probe:${name}`, () => listStress(name));
  const { data: budget } = useData('budget', getBudget);
  const left = budgetLeft(budget);
  const { tests, known } = useTestCount(name);
  const { options, defaults } = useModelOptions();

  const [runs, setRuns] = useState<number>(RELIABILITY_RUNS.default);
  const [count, setCount] = useState<number>(REDTEAM_COUNT.default);
  const [picked, setPicked] = useState<string[] | null>(null);
  const models = picked ?? defaults;

  const go = (id: string) => router.push(`/agents/${enc}/stress/${encodeURIComponent(id)}`);
  const testsWord = `${tests}${known ? '' : '≈'} tests`;

  if (probe.error && isNotDeployed(probe.error)) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <BackLink href={`/agents/${enc}`}>{name}</BackLink>
        <PageTitle name={name} title="Stress lab" />
        <NotDeployed />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <BackLink href={`/agents/${enc}`}>{name}</BackLink>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle name={name} title="Stress lab">
          Test this agent much harder than one deploy does. Every run here is a dry run on throwaway twin databases: nothing ships,
          and the version that&apos;s serving stays exactly as it is.
        </PageTitle>
        <p className="text-sm text-muted-foreground">
          Budget left{' '}
          <span className="font-mono text-lg font-semibold text-foreground tabular-nums">
            {left === null ? '—' : `$${left.toFixed(2)}`}
          </span>
          {budget && <span className="font-mono"> of ${budget.budget_usd.toFixed(2)}</span>}
        </p>
      </div>

      <section aria-label="Start a stress run" className="grid gap-4 lg:grid-cols-3">
        <LaunchCard
          mode="reliability"
          runsLabel={`${testsWord} × ${runs} runs = ${plannedRuns({ mode: 'reliability', tests, runs })} test runs · fast profile`}
          estimate={estimateCost({ mode: 'reliability', tests, runs })}
          left={left}
          onLaunch={async () => go((await startStress(name, { mode: 'reliability', runs }, tests)).stress_id)}
        >
          <NumberStepper
            label="Runs per test"
            value={runs}
            min={RELIABILITY_RUNS.min}
            max={RELIABILITY_RUNS.max}
            unit="runs"
            onChange={(n) => setRuns(clamp(n, RELIABILITY_RUNS.min, RELIABILITY_RUNS.max))}
          />
        </LaunchCard>

        <LaunchCard
          mode="redteam"
          runsLabel={`${count} generated attacks, one twin each`}
          estimate={estimateCost({ mode: 'redteam', tests, count })}
          left={left}
          onLaunch={async () => go((await startStress(name, { mode: 'redteam', count }, tests)).stress_id)}
        >
          <NumberStepper
            label="Attacks"
            value={count}
            min={REDTEAM_COUNT.min}
            max={REDTEAM_COUNT.max}
            step={5}
            unit="attacks"
            onChange={(n) => setCount(clamp(n, REDTEAM_COUNT.min, REDTEAM_COUNT.max))}
          />
        </LaunchCard>

        <LaunchCard
          mode="matrix"
          runsLabel={`${testsWord} × ${models.length} models = ${plannedRuns({ mode: 'matrix', tests, models: models.length })} test runs`}
          estimate={estimateCost({ mode: 'matrix', tests, models: models.length })}
          left={left}
          disabledReason={models.length < MATRIX_MODELS.min ? `Pick at least ${MATRIX_MODELS.min} models.` : null}
          onLaunch={async () => go((await startStress(name, { mode: 'matrix', models }, tests)).stress_id)}
        >
          <ModelPicker options={options} value={models} onChange={setPicked} />
        </LaunchCard>
      </section>

      <section aria-labelledby="recent-stress" className="flex flex-col gap-3">
        <h2 id="recent-stress" className="board-title text-2xl">
          Recent stress runs
        </h2>
        <RecentRuns name={name} />
      </section>
    </div>
  );
}
