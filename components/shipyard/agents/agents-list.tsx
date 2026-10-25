'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowRight, Bot, Loader2 } from 'lucide-react';
import type { AgentSummary } from '@/lib/contracts/api';
import { Button } from '@/components/ui/button';
import { getAgent, getAgents, getGate } from '../api';
import { fmtCost, fmtPct, fmtRelative } from '../format';
import { EmptyState, ErrorState, StaleNotice, TableSkeleton } from '../states';
import { StatusPill } from '../status';
import { useData, useNow } from '../use-data';
import { ActivityFeed, SimulateTrafficButton } from '../activity/activity';
import { useDeploy } from './use-deploy';

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
        className="inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap text-primary hover:underline"
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
function ServingStatus({ a, linkLatest = true }: { a: AgentSummary; linkLatest?: boolean }) {
  const note = a.current_version !== null ? latestNote(a) : null;
  return (
    <div className="flex flex-col items-start gap-0.5">
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
            className={`text-xs whitespace-nowrap hover:underline ${a.latest_status === 'blocked' ? 'text-fail' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {note}
          </Link>
        ) : (
          <span className={`text-xs whitespace-nowrap ${a.latest_status === 'blocked' ? 'text-fail' : 'text-muted-foreground'}`}>{note}</span>
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
  const items: { label: string; value: string; cls?: string }[] = [
    { label: 'serving', value: `${serving}/${agents.length}` },
    { label: running === 1 ? 'gate running' : 'gates running', value: String(running), cls: running > 0 ? 'text-running' : undefined },
    { label: blocked === 1 ? 'deploy blocked' : 'deploys blocked', value: String(blocked), cls: blocked > 0 ? 'text-fail' : undefined },
    { label: 'live runs in 24h', value: runs.toLocaleString() },
  ];
  // One counters strip, same pattern as the gate board: numerals carry the weight, no metric cards.
  return (
    <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-y py-3">
      {items.map((i) => (
        <div key={i.label} className="flex items-baseline gap-2">
          <dt className="order-last text-sm text-muted-foreground">{i.label}</dt>
          <dd className={`text-2xl font-bold tabular-nums ${i.cls ?? ''}`}>{i.value}</dd>
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
    <tr onClick={open} className="cursor-pointer hover:bg-accent focus-within:bg-accent">
      <td className="px-4 py-2.5">
        <Link href={agentHref(a)} onClick={(e) => e.stopPropagation()} className="font-mono font-semibold whitespace-nowrap hover:underline">
          {a.name}
        </Link>
        <div className="text-xs text-muted-foreground">{a.team ?? 'No team'}{a.owner ? ` · ${a.owner}` : ''}</div>
      </td>
      <td className="px-3 py-2.5">
        <span className={a.current_version === null ? 'text-muted-foreground' : 'font-mono font-semibold'}>
          {a.current_version === null ? 'none' : `v${a.current_version}`}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <ServingStatus a={a} />
      </td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtPct(a.pass_rate)}</td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtCost(a.avg_cost_usd)}</td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{a.runs_24h.toLocaleString()}</td>
      <td className="px-3 py-2.5 text-right text-xs whitespace-nowrap text-muted-foreground">{fmtRelative(a.updated_at, now)}</td>
      <td className="px-3 py-2.5 text-right">
        <RowAction a={a} />
      </td>
    </tr>
  );
}

function AgentCard({ a }: { a: AgentSummary }) {
  return (
    <li className="flex flex-col gap-1.5 p-4">
      <div className="flex items-center justify-between gap-2">
        <Link href={agentHref(a)} className="truncate font-mono font-semibold hover:underline">
          {a.name}
        </Link>
        <ServingStatus a={a} linkLatest={false} />
      </div>
      <div className="text-xs text-muted-foreground">{a.team ?? 'No team'}</div>
      <div className="flex items-center justify-between gap-2 font-mono text-xs">
        <span>
          {fmtPct(a.pass_rate)} pass · {fmtCost(a.avg_cost_usd)}/run
        </span>
        <RowAction a={a} />
      </div>
    </li>
  );
}

function AgentsTable({ agents, now }: { agents: AgentSummary[]; now: number }) {
  return (
    <div className="min-w-0 overflow-x-auto rounded-md border bg-card">
      <table className="hidden w-full text-sm md:table">
        <thead className="border-b bg-muted text-left">
          <tr>
            <th className="field-label px-4 py-2.5">Agent</th>
            <th className="field-label px-3 py-2.5 whitespace-nowrap">Live version</th>
            <th className="field-label px-3 py-2.5">Status</th>
            <th className="field-label px-3 py-2.5 text-right whitespace-nowrap">Pass rate</th>
            <th className="field-label px-3 py-2.5 text-right whitespace-nowrap">Avg / run</th>
            <th className="field-label px-3 py-2.5 text-right whitespace-nowrap">Runs 24h</th>
            <th className="field-label px-3 py-2.5 text-right">Updated</th>
            <th className="px-3 py-2.5">
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
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-balance">
            Agents {data && <span className="font-mono font-semibold text-muted-foreground tabular-nums">{data.length}</span>}
          </h1>
          <p className="text-sm text-muted-foreground">
            Every change is tested on throwaway twin databases before it reaches members. Create agents from any MCP client.
          </p>
        </div>
        <SimulateTrafficButton onDone={() => void refetch()} />
      </header>
      {data && data.length > 0 && <CounterStrip agents={data} />}
      {data && <StaleNotice error={error} onRetry={refetch} />}
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
        {body}
        <ActivityFeed limit={8} />
      </div>
    </div>
  );
}
