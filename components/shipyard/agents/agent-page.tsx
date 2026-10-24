'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowLeft, Loader2, RotateCcw, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { parse as parseYaml } from 'yaml';
import type { AgentDetail } from '@/lib/contracts/api';
import type { ValidationResult } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { deploy, getAgent, rollback } from '../api';
import { fmtCost, fmtDateTime, fmtPct } from '../format';
import { StatusPill } from '../status';
import { useData } from '../use-data';
import { ActivityFeed } from '../activity/activity';
import { ChatPanel } from './chat-panel';
import { GenerateTestsDialog } from './generate-tests-dialog';
import { parseScenario, ScenarioItem } from './scenario-list';
import { SpecEditor } from './spec-editor';

function packsOf(yaml: string): string[] {
  try {
    const s = parseYaml(yaml) as { test_packs?: unknown };
    return Array.isArray(s?.test_packs) ? s.test_packs.map(String) : [];
  } catch {
    return [];
  }
}

function VersionsTable({ d, onRollback }: { d: AgentDetail; onRollback: () => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Version</th>
            <th className="px-3 py-2 font-medium">Gate</th>
            <th className="px-3 py-2 text-right font-medium">Pass rate</th>
            <th className="px-3 py-2 text-right font-medium">Gate cost</th>
            <th className="px-3 py-2 font-medium">Started</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {d.versions.map((v) => (
            <tr key={v.version} className="hover:bg-muted/40">
              <td className="px-3 py-2.5 font-mono">
                <Link href={`/agents/${d.name}/versions/${v.version}`} className="font-medium hover:underline">
                  v{v.version}
                </Link>
                {v.version === d.current_version && <span className="sy-text-green ml-2 text-xs font-sans font-semibold">serving</span>}
              </td>
              <td className="px-3 py-2.5">
                <StatusPill status={v.status} />
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtPct(v.pass_rate)}</td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtCost(v.total_cost_usd, 3)}</td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtDateTime(v.started_at)}</td>
              <td className="px-3 py-2.5 text-right">
                {v.version === d.current_version && d.versions.some((x) => x.status === 'live' && x.version < v.version) && (
                  <Button size="sm" variant="outline" onClick={onRollback}>
                    <RotateCcw /> Rollback
                  </Button>
                )}
              </td>
            </tr>
          ))}
          {d.versions.length === 0 && (
            <tr>
              <td colSpan={6} className="p-6 text-center text-muted-foreground">No versions yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function AgentPage({ name }: { name: string }) {
  const router = useRouter();
  const { data: d, error, refetch } = useData(`agent:${name}`, () => getAgent(name));
  const [yaml, setYaml] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [deploying, setDeploying] = useState(false);

  const currentYaml = yaml ?? d?.draft_spec_yaml ?? '';
  const currentValidation = yaml === null ? (d?.validation ?? null) : validation;
  const scenarios = useMemo(
    () => Object.entries(d?.draft_scenarios ?? {}).map(([f, y]) => parseScenario(f, y)),
    [d?.draft_scenarios],
  );
  const packs = useMemo(() => packsOf(currentYaml), [currentYaml]);

  if (error) return <p className="sy-pill-red rounded-xl border p-4">Could not load {name}: {error.message}</p>;
  if (!d) return <div className="mx-auto h-96 max-w-7xl animate-pulse rounded-2xl bg-muted" />;

  const canDeploy = !!currentValidation?.ok && !deploying;
  const doDeploy = async () => {
    setDeploying(true);
    try {
      const r = await deploy(name);
      router.push(`/agents/${name}/versions/${r.version}`);
    } catch (e) {
      toast.error('Deploy failed', { description: e instanceof Error ? e.message : String(e) });
      setDeploying(false);
    }
  };
  const doRollback = async () => {
    try {
      const r = await rollback(name);
      toast.success(`Rolled back. v${r.current_version} is serving.`);
      void refetch();
    } catch (e) {
      toast.error('Rollback failed', { description: e instanceof Error ? e.message : String(e) });
    }
  };
  const latest = d.versions[0];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link href="/agents" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Agents
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold tracking-tight sm:text-3xl">{d.name}</h1>
          {latest && (
            <Link href={`/agents/${name}/versions/${latest.version}`} className="inline-flex items-center gap-1.5">
              <span className="font-mono text-sm text-muted-foreground">v{latest.version}</span>
              <StatusPill status={latest.status} />
            </Link>
          )}
          <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
            <GenerateTestsDialog name={name} onAccepted={() => void refetch()} />
            <Button onClick={doDeploy} disabled={!canDeploy} title={canDeploy ? 'Run the gate on a new version' : 'Fix spec errors first'}>
              {deploying ? <Loader2 className="animate-spin" /> : <Rocket />} Deploy
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {d.team ?? 'No team'} · owner {d.owner ?? '—'} · serving{' '}
          <span className="font-mono">{d.current_version ? `v${d.current_version}` : 'none'}</span>
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col gap-2" aria-label="Spec">
          <h2 className="text-sm font-semibold">agent.yaml <span className="font-normal text-muted-foreground">(draft)</span></h2>
          <SpecEditor
            key={d.name}
            name={name}
            initial={d.draft_spec_yaml}
            initialValidation={d.validation}
            onChange={(y, v) => {
              setYaml(y);
              setValidation(v);
            }}
          />
        </section>

        <Tabs defaultValue="scenarios" className="min-w-0">
          <TabsList>
            <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
            <TabsTrigger value="versions">Versions</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="scenarios" className="flex flex-col gap-3 pt-3">
            <p className="text-sm text-muted-foreground">
              {scenarios.length} hand-written {scenarios.length === 1 ? 'scenario' : 'scenarios'}
              {packs.length > 0 && (
                <>
                  {' '}+ shared packs <span className="font-mono">{packs.join(', ')}</span>, expanded at deploy time
                </>
              )}
              .
            </p>
            <ul className="flex flex-col gap-2">
              {scenarios.map((s) => (
                <ScenarioItem key={s.file} s={s} />
              ))}
            </ul>
          </TabsContent>
          <TabsContent value="versions" className="pt-3">
            <VersionsTable d={d} onRollback={doRollback} />
          </TabsContent>
          <TabsContent value="chat" className="pt-3">
            <ChatPanel name={name} liveVersion={d.current_version} />
          </TabsContent>
          <TabsContent value="activity" className="pt-3">
            <ActivityFeed agent={name} limit={10} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
