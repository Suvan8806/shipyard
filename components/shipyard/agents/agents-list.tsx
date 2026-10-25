'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowRight, Bot, Loader2, Lock } from 'lucide-react';
import type { AgentSummary } from '@/lib/contracts/api';
import { Button } from '@/components/ui/button';
import { getAgent, getAgents, getGate } from '../api';
import { fmtCost, fmtPct, fmtRelative } from '../format';
import { EmptyState, ErrorState, StaleNotice, TableSkeleton } from '../states';
import { StatusPill } from '../status';
import { Flap } from '../flap';
import { useData, useNow } from '../use-data';
import { ActivityFeed, SimulateTrafficButton } from '../activity/activity';
import { useDeploy } from './use-deploy';
import { HowItWorksGuide } from '../onboarding';

const POLL_MS = 5000;
/** The agent the stage demo opens (agents/DEMO.md). */
const DEMO_AGENT = 'support-agent';
const agentHref = (a: AgentSummary) => `/agents/${encodeURIComponent(a.name)}`;
const gateHref = (a: AgentSummary, v: number) => `${agentHref(a)}/versions/${v}`;

function RowAction({ a }: { a: AgentSummary }) {
  const runningVersion = a.latest_status === 'running' ? a.latest_version : null;
  const { busy, start } = useDeploy(a.name, runningVersion);
  if (runningVersion !== null) {
    return (
      <Link
        href={gateHref(a, runningVersion)}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 rounded-sm text-sm font-semibold whitespace-nowrap text-link underline-offset-4 hover:underline"
      >
        Watch gate <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        void start();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {busy && <Loader2 className="animate-spin" aria-hidden />}
      {busy ? 'Deploying…' : 'Deploy'}
    </Button>
  );
}

/** What the newest gate attempt is, when it isn't the serving version ("latest v4 blocked"). */
function latestNote(a: AgentSummary): string | null {
  if (a.latest_version === null || a.latest_version === a.current_version) return null;
  const v = `v${a.latest_version}`;
  switch (a.latest_status) {
    case 'blocked':
      return `latest ${v} blocked`;
    case 'running':
      return `${v} gate running`;
    case 'live':
      return `${v} passed · not serving`;
    case 'error':
      return `${v} gate error`;
    default:
      return null;
  }
}

/**
 * Serving state first ("Live v3"); the newest attempt second when it differs ("latest v4 blocked").
 * With nothing serving, the newest attempt's status is the primary pill.
 */
function NoteMark({ status }: { status: AgentSummary['latest_status'] }) {
  if (status === 'running') return <span className="lamp text-running" data-blink="true" aria-hidden />;
  if (status === 'blocked') return <Lock className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />;
  return null;
}

function noteCls(status: AgentSummary['latest_status']): string {
  if (status === 'blocked') return 'font-semibold text-fail';
  if (status === 'running') return 'font-semibold text-running';
  return 'text-muted-foreground';
}

function ServingStatus({ a, linkLatest = true }: { a: AgentSummary; linkLatest?: boolean }) {
  const note = a.current_version !== null ? latestNote(a) : null;
  return (
    <div className="flex flex-col items-start gap-1">
      {a.current_version !== null ? (
        <StatusPill status="live" label={`Live v${a.current_version}`} />
      ) : (
        <StatusPill status={a.latest_status} />
      )}
      {note && a.latest_version !== null && (
        linkLatest ? (
          <Link
            href={gateHref(a, a.latest_version)}
            onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
            className={`inline-flex items-center gap-1.5 text-xs whitespace-nowrap hover:underline ${noteCls(a.latest_status)}`}
          >
            <NoteMark status={a.latest_status} />
            {note}
          </Link>
        ) : (
          <span className={`inline-flex items-center gap-1.5 text-xs whitespace-nowrap ${noteCls(a.latest_status)}`}>
            <NoteMark status={a.latest_status} />
            {note}
          </span>
        )
      )}
    </div>
  );
}

function CounterStrip({ agents }: { agents: AgentSummary[] }) {
  const serving = agents.filter((a) => a.current_version !== null).length;
  const blocked = agents.filter((a) => a.latest_status === 'blocked').length;
  const running = agents.filter((a) => a.latest_status === 'running').length;
  const runs = agents.reduce((s, a) => s + a.runs_24h, 0);
  const items: { label: string; value: string; tone: 'pass' | 'running' | 'fail' | 'muted' | 'ink' }[] = [
    { label: 'serving', value: `${serving}/${agents.length}`, tone: serving > 0 ? 'pass' : 'muted' },
    { label: running === 1 ? 'gate running' : 'gates running', value: String(running), tone: running > 0 ? 'running' : 'muted' },
    { label: blocked === 1 ? 'deploy blocked' : 'deploys blocked', value: String(blocked), tone: blocked > 0 ? 'fail' : 'muted' },
    { label: 'live runs in 24h', value: runs.toLocaleString(), tone: 'ink' },
  ];
  // The fleet board: one board-black strip, flap numerals in lamp tones, labels beneath like a departures header.
  return (
    <dl className="board grid grid-cols-2 overflow-hidden sm:grid-cols-4">
      {items.map((i, idx) => (
        <div
          key={i.label}
          className={`flex flex-col gap-2.5 px-4 py-4 sm:px-6 sm:py-5 ${idx % 2 === 1 ? 'border-l border-board-rule' : ''} ${idx >= 2 ? 'border-t border-board-rule sm:border-t-0' : ''} ${idx === 2 ? 'sm:border-l' : ''}`}
        >
          <dt className="order-last field-label text-board-muted">{i.label}</dt>
          <dd>
            <Flap text={i.value} tone={i.tone} label={`${i.value} ${i.label}`} className="text-3xl sm:text-4xl" />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AgentRow({ a, now }: { a: AgentSummary; now: number }) {
  const router = useRouter();
  const open = () => router.push(agentHref(a));
  // The whole row is a mouse target; keyboard users get one tab stop per row (the name link) plus the row action.
  return (
    <tr onClick={open} className="cursor-pointer transition-colors hover:bg-muted/60 focus-within:bg-muted/60">
      <td className="py-3 pr-3 pl-5">
        <Link href={agentHref(a)} onClick={(e) => e.stopPropagation()} className="rounded-sm font-mono text-base font-bold whitespace-nowrap hover:underline">
          {a.name}
        </Link>
        <div className="mt-0.5 text-sm text-muted-foreground">{a.team ?? 'No team'}{a.owner ? ` · ${a.owner}` : ''}</div>
      </td>
      <td className="px-3 py-3">
        <VersionFlap a={a} />
      </td>
      <td className="px-3 py-3">
        <ServingStatus a={a} />
      </td>
      <td className="px-3 py-3 text-right font-mono text-[0.9375rem] tabular-nums">{fmtPct(a.pass_rate)}</td>
      <td className="px-3 py-3 text-right font-mono text-[0.9375rem] tabular-nums">{fmtCost(a.avg_cost_usd)}</td>
      <td className="px-3 py-3 text-right font-mono text-[0.9375rem] tabular-nums">{a.runs_24h.toLocaleString()}</td>
      <td className="px-3 py-3 text-right text-sm whitespace-nowrap text-muted-foreground">{fmtRelative(a.updated_at, now)}</td>
      <td className="py-3 pr-5 pl-3 text-right">
        <RowAction a={a} />
      </td>
    </tr>
  );
}

function VersionFlap({ a, className = 'text-xl' }: { a: AgentSummary; className?: string }) {
  return a.current_version === null ? (
    <Flap text="none" tone="muted" label="No live version" className={className} />
  ) : (
    <Flap text={`v${a.current_version}`} tone="signal" label={`Live version v${a.current_version}`} className={className} />
  );
}

function AgentCard({ a }: { a: AgentSummary }) {
  return (
    <li className="flex flex-col gap-3 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={agentHref(a)} className="block truncate rounded-sm font-mono text-base font-bold hover:underline">
            {a.name}
          </Link>
          <div className="truncate text-sm text-muted-foreground">
            {a.team ?? 'No team'}
            {a.owner ? ` · ${a.owner}` : ''}
          </div>
        </div>
        <VersionFlap a={a} />
      </div>
      <div className="flex items-end justify-between gap-3">
        <ServingStatus a={a} linkLatest={false} />
        <RowAction a={a} />
      </div>
      <div className="font-mono text-xs text-muted-foreground tabular-nums">
        {fmtPct(a.pass_rate)} pass · {fmtCost(a.avg_cost_usd)}/run · {a.runs_24h.toLocaleString()} runs 24h
      </div>
    </li>
  );
}

function AgentsTable({ agents, now }: { agents: AgentSummary[]; now: number }) {
  return (
    <div className="panel min-w-0 overflow-hidden">
      <div className="hidden overflow-x-auto md:block">
      <table className="w-full text-sm">
        <thead className="border-b-2 border-foreground/80 text-left">
          <tr>
            <th className="field-label py-2.5 pr-3 pl-5">Agent</th>
            <th className="field-label px-3 py-2.5 whitespace-nowrap">Live version</th>
            <th className="field-label px-3 py-2.5">Status</th>
            <th className="field-label px-3 py-2.5 text-right whitespace-nowrap">Pass rate</th>
            <th className="field-label px-3 py-2.5 text-right whitespace-nowrap">Avg / run</th>
            <th className="field-label px-3 py-2.5 text-right whitespace-nowrap">Runs 24h</th>
            <th className="field-label px-3 py-2.5 text-right">Updated</th>
            <th className="py-2.5 pr-5 pl-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {agents.map((a) => (
            <AgentRow key={a.name} a={a} now={now} />
          ))}
        </tbody>
      </table>
      </div>
      <ul className="divide-y md:hidden">
        {agents.map((a) => (
          <AgentCard key={a.name} a={a} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Once per mount, warm what the demo clicks next: the demo agent's detail and its serving + latest gates (API GETs
 * that wake the functions and DB) and the matching routes. Warm-up only, so failures are ignored.
 */
function usePrewarmDemo(agents: AgentSummary[] | null) {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !agents) return;
    done.current = true;
    const a = agents.find((x) => x.name === DEMO_AGENT);
    if (!a) return;
    const versions = [...new Set([a.current_version, a.latest_version].filter((v): v is number => v !== null))];
    const ignore = () => undefined;
    void getAgent(a.name).catch(ignore);
    router.prefetch(agentHref(a));
    for (const v of versions) {
      void getGate(a.name, v).catch(ignore);
      router.prefetch(gateHref(a, v));
    }
  }, [agents, router]);
}

export function AgentsList() {
  const { data, error, loading, refetch } = useData('agents', getAgents, { pollMs: POLL_MS });
  const now = useNow(30000);
  usePrewarmDemo(data);

  let body: ReactNode;
  if (loading && !data) body = <TableSkeleton rows={8} cols={6} />;
  else if (error && !data) body = <ErrorState title="Couldn't load agents" error={error} onRetry={refetch} />;
  else if (data && data.length === 0) {
    body = (
      <EmptyState icon={<Bot />} title="No agents yet">
        Create one from a 16-line spec, or ask Claude Code: &ldquo;create a support agent and deploy it.&rdquo;
      </EmptyState>
    );
  } else body = <AgentsTable agents={data ?? []} now={now} />;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="board-title flex items-baseline gap-3 text-3xl sm:text-4xl">
            Agents {data && <span className="font-mono text-2xl font-semibold text-muted-foreground tabular-nums sm:text-3xl">{data.length}</span>}
          </h1>
          <p className="max-w-2xl text-base text-pretty text-muted-foreground">
            Every change is tested on throwaway twin databases before it reaches members. Create agents from any MCP client.
          </p>
        </div>
        <SimulateTrafficButton onDone={() => void refetch()} />
      </header>
      <HowItWorksGuide />
      {data && data.length > 0 && <CounterStrip agents={data} />}
      {data && <StaleNotice error={error} onRetry={refetch} />}
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_380px] 2xl:items-start">
        {body}
        <ActivityFeed limit={8} />
      </div>
    </div>
  );
}
