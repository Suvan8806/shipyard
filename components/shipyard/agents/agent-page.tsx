'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import { parse as parseYaml } from 'yaml';
import type { AgentDetail, LibraryResponse } from '@/lib/contracts/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAgent, getLibrary } from '../api';
import { EmptyState, ErrorState, Skeleton, StaleNotice } from '../states';
import { useData } from '../use-data';
import { ActivityFeed } from '../activity/activity';
import { AgentHeader } from './agent-header';
import { ChatPanel } from './chat-panel';
import { parseScenario, ScenarioItem } from './scenario-list';
import { SpecEditor, type SpecStatus } from './spec-editor';
import { VersionsTable } from './versions-table';

const POLL_MS = 5000;

interface SpecParts {
  profile: string | null;
  inherit: string[];
  packs: string[];
}

function specParts(yaml: string): SpecParts {
  try {
    const s = parseYaml(yaml) as { profile?: unknown; inherit?: unknown; test_packs?: unknown } | null;
    const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
    return { profile: typeof s?.profile === 'string' ? s.profile : null, inherit: list(s?.inherit), packs: list(s?.test_packs) };
  } catch {
    return { profile: null, inherit: [], packs: [] };
  }
}

/** "12 tests" when the library is loaded, else "3 scenarios plus 5 test packs". */
function testCountLabel(scenarios: number, packs: string[], lib: LibraryResponse | null): string {
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (lib) {
    const fromPacks = packs.reduce((n, p) => n + (lib.packs.find((x) => x.name === p)?.templates ?? 0), 0);
    return plural(scenarios + fromPacks, 'test');
  }
  return packs.length ? `${plural(scenarios, 'scenario')} plus ${plural(packs.length, 'test pack')}` : plural(scenarios, 'scenario');
}

function InheritedChips({ parts }: { parts: SpecParts }) {
  const groups: [string, string[]][] = [
    ['profile', parts.profile ? [parts.profile] : []],
    ['inherit', parts.inherit],
    ['test_packs', parts.packs],
  ];
  const shown = groups.filter(([, v]) => v.length > 0);
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      {shown.map(([label, values]) => (
        <span key={label} className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-muted-foreground">{label}:</span>
          {values.map((v) => (
            <Link key={v} href="/library" className="rounded-sm border bg-muted px-1.5 py-0.5 font-mono text-foreground hover:border-primary hover:text-primary">
              {v}
            </Link>
          ))}
        </span>
      ))}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6" aria-busy="true" aria-label="Loading agent">
      <Skeleton className="h-4 w-20" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-6 xl:grid-cols-12">
        <Skeleton className="h-[420px] xl:col-span-7" />
        <Skeleton className="h-[420px] xl:col-span-5" />
      </div>
    </div>
  );
}

function ScenariosTab({ d, packs, testCount }: { d: AgentDetail; packs: string[]; testCount: string }) {
  const scenarios = useMemo(() => Object.entries(d.draft_scenarios ?? {}).map(([f, y]) => parseScenario(f, y)), [d.draft_scenarios]);
  const packNote = packs.length > 0 && (
    <>
      {' '}Shared test packs <span className="font-mono">{packs.join(', ')}</span> are expanded at deploy time.
    </>
  );
  if (scenarios.length === 0) {
    return (
      <EmptyState icon={<FileText />} title="No hand-written scenarios">
        {packs.length > 0 ? <>The gate still runs {testCount} from shared packs.{packNote}</> : 'Generate tests from the spec, or add scenario files to the draft.'}
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {scenarios.length} hand-written {scenarios.length === 1 ? 'scenario' : 'scenarios'}, {testCount} in all.{packNote}
      </p>
      <ul className="flex flex-col gap-2">
        {scenarios.map((s) => (
          <ScenarioItem key={s.file} s={s} />
        ))}
      </ul>
    </div>
  );
}

export function AgentPage({ name }: { name: string }) {
  const { data: d, error, loading, refetch } = useData(`agent:${name}`, () => getAgent(name), {
    pollMs: POLL_MS,
    shouldPoll: (x) => !!x?.versions.some((v) => v.status === 'running'),
  });
  const { data: lib } = useData('library', getLibrary);
  const [spec, setSpec] = useState<SpecStatus | null>(null);

  const yaml = spec?.yaml ?? d?.draft_spec_yaml ?? '';
  const parts = useMemo(() => specParts(yaml), [yaml]);

  if (loading && !d) return <PageSkeleton />;
  if (error && !d) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <Link href="/agents" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Agents
        </Link>
        <ErrorState title={`Couldn't load ${name}`} error={error} onRetry={refetch} />
      </div>
    );
  }
  if (!d) return null;

  const scenarioCount = Object.keys(d.draft_scenarios ?? {}).length;
  const testCount = testCountLabel(scenarioCount, parts.packs, lib);
  const validation = spec ? spec.validation : d.validation;
  const save = spec?.save ?? 'idle';

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <AgentHeader d={d} validation={validation} save={save} onScenariosChanged={() => void refetch()} />
      <StaleNotice error={error} onRetry={refetch} />

      <div className="grid gap-6 xl:grid-cols-12">
        <section className="flex min-w-0 flex-col gap-3 xl:col-span-7" aria-label="Spec">
          <SpecEditor key={d.name} name={name} initial={d.draft_spec_yaml} initialValidation={d.validation} onStatus={setSpec} />
          <InheritedChips parts={parts} />
        </section>

        <Tabs defaultValue="scenarios" className="min-w-0 xl:col-span-5">
          <TabsList>
            <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
            <TabsTrigger value="versions">Versions</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="scenarios" className="pt-3">
            <ScenariosTab d={d} packs={parts.packs} testCount={testCount} />
          </TabsContent>
          <TabsContent value="versions" className="pt-3">
            <VersionsTable d={d} testCount={testCount} onChanged={() => void refetch()} />
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
