'use client';
// Version diff /agents/[name]/diff?from=&to=: what changed in the spec, and which tests changed because of it.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, GitCompare } from 'lucide-react';
import { getAgent, getDiff } from '../api';
import { EmptyState, ErrorState, Skeleton, StaleNotice } from '../states';
import { StatusPill } from '../status';
import { useData } from '../use-data';
import { BackLink, isNotDeployed, NotDeployed } from '../stress/shared';
import { SpecDiff } from './spec-diff';
import { TestChanges } from './test-changes';

function VersionSelect({ label, value, options, onChange }: { label: string; value: number; options: number[]; onChange: (v: number) => void }) {
  const id = `diff-${label}`;
  return (
    <span className="inline-flex items-center gap-1.5">
      <label htmlFor={id} className="sr-only">
        {label} version
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 rounded-md border border-input bg-card px-2 font-mono text-base font-semibold"
      >
        {options.map((v) => (
          <option key={v} value={v}>
            v{v}
          </option>
        ))}
      </select>
    </span>
  );
}

export function VersionDiffPage({ name, from, to }: { name: string; from: number | null; to: number | null }) {
  const router = useRouter();
  const enc = encodeURIComponent(name);
  const agent = useData(`agent:${name}`, () => getAgent(name));
  const versions = agent.data?.versions.map((v) => v.version) ?? [];
  // Defaults: newest version vs the one before it.
  const toV = to ?? versions[0] ?? null;
  const fromV = from ?? (toV !== null ? (versions.find((v) => v < toV) ?? null) : null);
  const ready = fromV !== null && toV !== null;
  const diff = useData(`diff:${name}:${fromV}:${toV}`, () => (ready ? getDiff(name, fromV, toV) : Promise.resolve(null)));

  const nav = (f: number, t: number) => router.replace(`/agents/${enc}/diff?from=${f}&to=${t}`);
  const statusOf = (v: number) => agent.data?.versions.find((x) => x.version === v)?.status ?? null;
  const back = <BackLink href={`/agents/${enc}`}>{name}</BackLink>;

  if (agent.error && !agent.data) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {back}
        <ErrorState title={`Couldn't load ${name}`} error={agent.error} onRetry={agent.refetch} />
      </div>
    );
  }
  if (agent.data && versions.length < 2 && !ready) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {back}
        <EmptyState icon={<GitCompare />} title="Nothing to compare yet">
          A diff needs two deployed versions. Deploy {name} again and come back.
        </EmptyState>
      </div>
    );
  }

  const fromStatus = fromV !== null ? statusOf(fromV) : null;
  const toStatus = toV !== null ? statusOf(toV) : null;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      {back}
      <header className="flex flex-col gap-3">
        <h1 className="board-title flex flex-wrap items-center gap-x-3 gap-y-2 text-3xl sm:text-4xl">
          <span>What changed</span>
          {ready && versions.length > 0 ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <VersionSelect label="From" value={fromV} options={versions} onChange={(v) => nav(v, toV)} />
              <ArrowRight className="size-5 text-muted-foreground" aria-hidden />
              <VersionSelect label="To" value={toV} options={versions} onChange={(v) => nav(fromV, v)} />
            </span>
          ) : (
            ready && (
              <span className="font-mono">
                v{fromV} → v{toV}
              </span>
            )
          )}
        </h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
          <span className="font-mono">{name}</span>
          {ready && fromStatus && (
            <span className="inline-flex items-center gap-1.5">
              <span className="font-mono">v{fromV}</span> <StatusPill status={fromStatus} />
            </span>
          )}
          {ready && toStatus && (
            <span className="inline-flex items-center gap-1.5">
              <span className="font-mono">v{toV}</span> <StatusPill status={toStatus} />
            </span>
          )}
          {ready && (
            <Link href={`/agents/${enc}/versions/${toV}`} className="inline-flex items-center gap-1 font-bold text-link hover:underline">
              Gate board v{toV} <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </p>
        {ready && fromV === toV && <p className="text-sm text-warn">Pick two different versions to see a difference.</p>}
      </header>

      {diff.error && !diff.data ? (
        isNotDeployed(diff.error) ? (
          <NotDeployed what="Version diff" />
        ) : (
          <ErrorState title="Couldn't load the diff" error={diff.error} onRetry={diff.refetch} />
        )
      ) : !diff.data ? (
        <div className="grid gap-6 xl:grid-cols-12" aria-busy="true">
          <Skeleton className="h-80 xl:col-span-7" />
          <Skeleton className="h-80 xl:col-span-5" />
        </div>
      ) : (
        <>
          <StaleNotice error={diff.error} onRetry={diff.refetch} />
          <div className="grid gap-6 xl:grid-cols-12">
            <div className="min-w-0 xl:col-span-7">
              <TestChanges diff={diff.data} />
            </div>
            <div className="min-w-0 xl:col-span-5">
              <SpecDiff diff={diff.data} fileName={`${name}.yaml`} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
