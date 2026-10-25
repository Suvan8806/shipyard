'use client';
// Test changes between two versions, grouped: Newly failing (loud), Fixed, Still failing, Added/Removed, and the
// unchanged passes folded away.
import { ChevronDown, CircleCheck, CircleMinus, CirclePlus, OctagonX } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { ScenarioChange, VersionDiff } from '../stress/contract';

type Row = VersionDiff['scenarios'][number];

export function groupChanges(rows: Row[]): Record<ScenarioChange, Row[]> {
  const g: Record<ScenarioChange, Row[]> = { newly_failing: [], fixed: [], still_failing: [], added: [], removed: [], still_passing: [] };
  for (const r of rows) (g[r.change] ?? g.still_passing).push(r);
  for (const k of Object.keys(g) as ScenarioChange[]) g[k].sort((a, b) => a.scenario.localeCompare(b.scenario));
  return g;
}

const statusWord = (s: string | null) => (s === null ? 'none' : s);

function Transition({ r }: { r: Row }) {
  return (
    <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">
      {statusWord(r.from_status)} → {statusWord(r.to_status)}
    </span>
  );
}

function Group({ title, count, icon, tone, children }: { title: string; count: number; icon: ReactNode; tone: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className={cn('flex items-center gap-1.5 text-base font-semibold', tone)}>
        {icon} {title} <span className="font-normal text-muted-foreground">· {count}</span>
      </h3>
      {children}
    </section>
  );
}

export function TestChanges({ diff }: { diff: VersionDiff }) {
  const g = groupChanges(diff.scenarios);
  const simple = (rows: Row[]) => (
    <ul className="divide-y overflow-hidden rounded-md border bg-card">
      {rows.map((r) => (
        <li key={r.scenario} className="flex items-center gap-3 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate" title={r.scenario}>
            {r.scenario}
          </span>
          <Transition r={r} />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-y py-3 text-base">
        <span className={cn('inline-flex items-baseline gap-1.5', g.newly_failing.length ? 'text-fail' : 'text-muted-foreground')}>
          <span className="text-3xl font-bold tabular-nums">{g.newly_failing.length}</span> newly failing
        </span>
        <span className={cn('inline-flex items-baseline gap-1.5', g.fixed.length ? 'text-pass' : 'text-muted-foreground')}>
          <span className="text-2xl font-bold tabular-nums">{g.fixed.length}</span> fixed
        </span>
        <span className="inline-flex items-baseline gap-1.5 text-muted-foreground">
          <span className="text-2xl font-bold tabular-nums text-foreground">{g.still_failing.length}</span> still failing
        </span>
        <span className="inline-flex items-baseline gap-1.5 text-muted-foreground">
          <span className="text-2xl font-bold tabular-nums text-foreground">{g.still_passing.length}</span> unchanged
        </span>
      </div>

      {g.newly_failing.length > 0 && (
        <section aria-labelledby="newly-failing" className="flex flex-col gap-2">
          <h3 id="newly-failing" className="sr-only">
            Newly failing
          </h3>
          <ul className="flex flex-col gap-2">
            {g.newly_failing.map((r) => (
              <li key={r.scenario} className="overflow-hidden rounded-md border border-fail-border bg-card">
                <div className="flex items-center gap-2 bg-fail-solid px-3 py-2 text-fail-solid-foreground">
                  <OctagonX className="size-5" strokeWidth={2} aria-hidden />
                  <span className="status-word text-lg">Newly failing</span>
                  <span className="ml-auto font-mono text-xs opacity-90">
                    {statusWord(r.from_status)} → {statusWord(r.to_status)}
                  </span>
                </div>
                <p className="px-3 py-2.5 text-lg font-semibold break-words">{r.scenario}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {g.fixed.length > 0 && (
        <Group title="Fixed" count={g.fixed.length} tone="text-pass" icon={<CircleCheck className="size-4" strokeWidth={1.75} aria-hidden />}>
          {simple(g.fixed)}
        </Group>
      )}
      {g.still_failing.length > 0 && (
        <Group title="Still failing" count={g.still_failing.length} tone="text-fail" icon={<OctagonX className="size-4" strokeWidth={1.75} aria-hidden />}>
          {simple(g.still_failing)}
        </Group>
      )}
      {g.added.length > 0 && (
        <Group title="New tests" count={g.added.length} tone="text-foreground" icon={<CirclePlus className="size-4" strokeWidth={1.75} aria-hidden />}>
          {simple(g.added)}
        </Group>
      )}
      {g.removed.length > 0 && (
        <Group title="Removed tests" count={g.removed.length} tone="text-foreground" icon={<CircleMinus className="size-4" strokeWidth={1.75} aria-hidden />}>
          {simple(g.removed)}
        </Group>
      )}
      {g.still_passing.length > 0 && (
        <details className="group rounded-md border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground">
            <CircleCheck className="size-4 text-pass" strokeWidth={1.75} aria-hidden />
            {g.still_passing.length} tests passed in both versions
            <ChevronDown className="ml-auto size-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="grid gap-x-4 border-t px-3 py-2 text-sm text-muted-foreground sm:grid-cols-2">
            {g.still_passing.map((r) => (
              <li key={r.scenario} className="truncate py-0.5" title={r.scenario}>
                {r.scenario}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
