'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import type { AgentSummary } from '@/lib/contracts/api';
import { Button } from '@/components/ui/button';
import { deploy, getAgents } from '../api';
import { fmtCost, fmtPct, fmtRelative } from '../format';
import { StatusPill } from '../status';
import { useData, useNow } from '../use-data';
import { ActivityFeed, SimulateTrafficButton } from '../activity/activity';

function DeployButton({ name }: { name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setBusy(true);
        try {
          const r = await deploy(name);
          router.push(`/agents/${name}/versions/${r.version}`);
        } catch (err) {
          toast.error('Deploy failed', { description: err instanceof Error ? err.message : String(err) });
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <Rocket />} Deploy
    </Button>
  );
}

function Summary({ agents }: { agents: AgentSummary[] }) {
  const live = agents.filter((a) => a.current_version !== null).length;
  const blocked = agents.filter((a) => a.latest_status === 'blocked').length;
  const runs = agents.reduce((s, a) => s + a.runs_24h, 0);
  const items = [
    { label: 'Agents serving', value: `${live}/${agents.length}` },
    { label: 'Deploys blocked', value: String(blocked), red: blocked > 0 },
    { label: 'Live runs, 24h', value: runs.toLocaleString() },
    { label: 'Teams', value: String(new Set(agents.map((a) => a.team)).size) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="rounded-xl border bg-card p-3">
          <div className="text-xs text-muted-foreground">{i.label}</div>
          <div className={`font-mono text-2xl font-semibold tabular-nums ${i.red ? 'sy-text-red' : ''}`}>{i.value}</div>
        </div>
      ))}
    </div>
  );
}

export function AgentsList() {
  const { data, error, loading, refetch } = useData('agents', getAgents, { pollMs: 4000 });
  const now = useNow(30000);
  const agents = data ?? [];
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
          <p className="text-muted-foreground">Every change is tested on throwaway twin databases before it reaches members.</p>
        </div>
        <SimulateTrafficButton onDone={() => void refetch()} />
      </header>
      {data && <Summary agents={agents} />}
      {error && <p className="sy-pill-red rounded-xl border p-4 text-sm">Could not load agents: {error.message}</p>}
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 overflow-hidden rounded-xl border bg-card">
          {/* Desktop table */}
          <table className="hidden w-full text-sm md:table">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Agent</th>
                <th className="px-3 py-2.5 font-medium">Team · owner</th>
                <th className="px-3 py-2.5 font-medium">Serving</th>
                <th className="px-3 py-2.5 font-medium">Latest</th>
                <th className="px-3 py-2.5 text-right font-medium">Pass rate</th>
                <th className="px-3 py-2.5 text-right font-medium">Avg / run</th>
                <th className="px-3 py-2.5 text-right font-medium">Updated</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && !data &&
                Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-4 py-3">
                      <div className="h-5 animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))}
              {agents.map((a) => (
                <tr key={a.name} className="group hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link href={`/agents/${a.name}`} className="font-mono font-medium hover:underline">
                      {a.name}
                    </Link>
                    <div className="line-clamp-1 max-w-xs text-xs text-muted-foreground">{a.goal}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div>{a.team ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{a.owner ?? ''}</div>
                  </td>
                  <td className="px-3 py-3 font-mono">{a.current_version ? `v${a.current_version}` : 'none'}</td>
                  <td className="px-3 py-3">
                    <Link
                      href={a.latest_version ? `/agents/${a.name}/versions/${a.latest_version}` : `/agents/${a.name}`}
                      className="inline-flex items-center gap-1.5"
                    >
                      <span className="font-mono text-xs text-muted-foreground">{a.latest_version ? `v${a.latest_version}` : ''}</span>
                      <StatusPill status={a.latest_status} />
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{fmtPct(a.pass_rate)}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{fmtCost(a.avg_cost_usd)}</td>
                  <td className="px-3 py-3 text-right text-xs text-muted-foreground">{fmtRelative(a.updated_at, now)}</td>
                  <td className="px-3 py-3 text-right">
                    <DeployButton name={a.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Mobile cards */}
          <ul className="divide-y md:hidden">
            {agents.map((a) => (
              <li key={a.name} className="flex flex-col gap-1.5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/agents/${a.name}`} className="truncate font-mono font-medium">
                    {a.name}
                  </Link>
                  <StatusPill status={a.latest_status} />
                </div>
                <div className="text-xs text-muted-foreground">
                  {a.team} · {a.owner} · serving {a.current_version ? `v${a.current_version}` : 'none'}
                </div>
                <div className="flex items-center justify-between font-mono text-xs">
                  <span>{fmtPct(a.pass_rate)} pass · {fmtCost(a.avg_cost_usd)}/run</span>
                  <DeployButton name={a.name} />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <ActivityFeed limit={8} />
      </div>
    </div>
  );
}
