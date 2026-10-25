'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import { parse as parseYaml } from 'yaml';
import type { AgentDetail, LibraryResponse } from '@/lib/contracts/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAgent, getLibrary } from '../api';
import { EmptyState, ErrorState, isNotFound, NotFoundState, Skeleton, StaleNotice } from '../states';
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
  tools: string[];
}

/** Pack name -> its templates' names and requires_tools (from the server page; same YAML the gate expands). */
export type PackTemplates = Record<string, { name: string; requires_tools: string[] }[]>;

function specParts(yaml: string): SpecParts {
  try {
    const s = parseYaml(yaml) as { profile?: unknown; inherit?: unknown; test_packs?: unknown; tools?: unknown } | null;
    const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
    return {
      profile: typeof s?.profile === 'string' ? s.profile : null,
      inherit: list(s?.inherit),
      packs: list(s?.test_packs),
      tools: list(s?.tools),
    };
  } catch {
    return { profile: null, inherit: [], packs: [], tools: [] };
  }
}

/**
 * Tests the gate will run: own scenarios plus pack templates whose requires_tools are all in the spec's tools,
 * deduped by name (lib/gate/packs.ts#expandPacks + lib/gate/gate.ts#mergeScenarios). Paraphrase variants excluded.
 */
function gateTestCount(ownNames: string[], parts: SpecParts, packTemplates: PackTemplates): number {
  const names = new Set(ownNames);
  for (const pack of parts.packs) {
    for (const t of packTemplates[pack] ?? []) {
      if (t.requires_tools.every((tool) => parts.tools.includes(tool))) names.add(`${pack}/${t.name}`);
    }
  }
  return names.size;
}

/** "46 tests" from the gate's own pack expansion; else the library's raw counts; else "3 scenarios plus 5 test packs". */
function testCountLabel(ownNames: string[], parts: SpecParts, lib: LibraryResponse | null, packTemplates?: PackTemplates): string {
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const scenarios = ownNames.length;
  const packs = parts.packs;
  if (packTemplates) return plural(gateTestCount(ownNames, parts, packTemplates), 'test');
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
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      {shown.map(([label, values]) => (
        <span key={label} className="flex flex-wrap items-center gap-1.5">
          <span className="field-label">{label}</span>
          {values.map((v) => (
            <Link key={v} href="/library" className="rounded-sm bg-board px-1.5 py-1 font-mono text-board-ink transition-colors hover:bg-signal hover:text-signal-foreground">
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
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading agent">
      <Skeleton className="h-4 w-20" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-6 2xl:grid-cols-12">
        <Skeleton className="h-[420px] 2xl:col-span-7" />
        <Skeleton className="h-[420px] 2xl:col-span-5" />
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

export function AgentPage({ name, packTemplates }: { name: string; packTemplates?: PackTemplates }) {
  const { data: d, error, loading, refetch } = useData(`agent:${name}`, () => getAgent(name), {
    pollMs: POLL_MS,
    shouldPoll: (x) => !!x?.versions.some((v) => v.status === 'running'),
  });
  const { data: lib } = useData('library', getLibrary);
  const [spec, setSpec] = useState<SpecStatus | null>(null);

  const yaml = spec?.yaml ?? d?.draft_spec_yaml ?? '';
  const parts = useMemo(() => specParts(yaml), [yaml]);

  if (loading && !d) return <PageSkeleton />;
  if (!d && isNotFound(error)) {
    return (
      <NotFoundState title="Agent not found">
        There is no agent named <span className="font-mono text-foreground">{name}</span>. It may have been removed by a reset.
      </NotFoundState>
    );
  }
  if (error && !d) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/agents" className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Agents
        </Link>
        <ErrorState title={`Couldn't load ${name}`} error={error} onRetry={refetch} />
      </div>
    );
  }
  if (!d) return null;

  const ownNames = Object.entries(d.draft_scenarios ?? {}).map(([f, y]) => parseScenario(f, y).name);
  const testCount = testCountLabel(ownNames, parts, lib, packTemplates);
  const validation = spec ? spec.validation : d.validation;
  const save = spec?.save ?? 'idle';

  return (
    <div className="flex flex-col gap-7">
      <AgentHeader d={d} validation={validation} save={save} onScenariosChanged={() => void refetch()} />
      <StaleNotice error={error} onRetry={refetch} />

      <div className="grid gap-6 xl:grid-cols-12">
        <section className="flex min-w-0 flex-col gap-3 xl:col-span-7" aria-label="Spec">
          <SpecEditor key={d.name} name={name} initial={d.draft_spec_yaml} initialValidation={d.validation} onStatus={setSpec} />
          <InheritedChips parts={parts} />
        </section>

        <Tabs defaultValue="scenarios" className="min-w-0 xl:col-span-5">
          <TabsList className="max-w-full overflow-x-auto">
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
