'use client';
// Library (design/direction.md 7.5): tool rows with policy chips, test packs, model profiles, instruction blocks.
import type { ReactNode } from 'react';
import { Blocks, ChevronRight, Cpu, FlaskConical, Shield, Wrench } from 'lucide-react';
import type { LibraryResponse } from '@/lib/contracts/api';
import type { Policy, ToolInfo } from '@/lib/types';
import { getLibrary } from '../api';
import { EmptyState, ErrorState, Skeleton, StaleNotice, TableSkeleton } from '../states';
import { useData } from '../use-data';

export function policyChips(p: Policy | null | undefined): string[] {
  if (!p) return [];
  const chips: string[] = [];
  if (typeof p.maxAmount === 'number') chips.push(`max $${p.maxAmount}`);
  if (typeof p.maxCallsPerRun === 'number') chips.push(`${p.maxCallsPerRun} per run`);
  if (p.requiresApproval) chips.push('needs approval');
  if (Array.isArray(p.blockExternalIfContains) && p.blockExternalIfContains.length) {
    chips.push(`no external email with ${p.blockExternalIfContains.join(', ')}`);
  }
  if (Array.isArray(p.allowedAgents) && p.allowedAgents.length) chips.push(`only ${p.allowedAgents.join(', ')}`);
  return chips;
}

function paramNames(schema: unknown): { name: string; required: boolean }[] {
  if (!schema || typeof schema !== 'object') return [];
  const s = schema as { properties?: unknown; required?: unknown };
  if (!s.properties || typeof s.properties !== 'object') return [];
  const req = new Set(Array.isArray(s.required) ? s.required.map(String) : []);
  return Object.keys(s.properties).map((name) => ({ name, required: req.has(name) }));
}

function Section({ Icon, title, count, children }: { Icon: typeof Wrench; title: string; count: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <Icon className="size-5 text-muted-foreground" strokeWidth={1.75} aria-hidden /> {title}
        <span className="font-mono text-sm font-normal text-muted-foreground tabular-nums">{count}</span>
      </h2>
      {children}
    </section>
  );
}

function ToolRow({ tool, policy }: { tool: ToolInfo; policy: Policy | null }) {
  const params = paramNames(tool.params);
  const chips = policyChips(policy);
  return (
    <li className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-start md:gap-6">
      <div className="min-w-0 md:w-56 md:shrink-0">
        <h3 className="font-mono text-sm font-semibold break-all">{tool.name}</h3>
        {params.length > 0 && (
          <p className="mt-0.5 font-mono text-xs break-words text-muted-foreground">
            ({params.map((p) => (p.required ? p.name : `${p.name}?`)).join(', ')})
          </p>
        )}
      </div>
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">{tool.description || 'No description.'}</p>
      <div className="flex flex-wrap gap-1.5 md:w-64 md:shrink-0 md:justify-end">
        {chips.length === 0 ? (
          <span className="text-xs text-muted-foreground">No policy</span>
        ) : (
          chips.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs text-foreground">
              <Shield className="size-3" strokeWidth={2} aria-hidden /> {c}
            </span>
          ))
        )}
      </div>
    </li>
  );
}

function LibrarySkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading library">
      <TableSkeleton rows={6} cols={3} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}

function LibraryBody({ lib }: { lib: LibraryResponse }) {
  const tools = lib.tools ?? [];
  const packs = lib.packs ?? [];
  const blocks = lib.blocks ?? [];
  const profiles = Object.entries(lib.profiles ?? {});
  const policies = lib.policies ?? {};
  return (
    <>
      <Section Icon={Wrench} title="Tools" count={tools.length}>
        {tools.length === 0 ? (
          <EmptyState title="No tools registered" />
        ) : (
          <ul className="divide-y rounded-md border bg-card">
            {tools.map((t) => (
              <ToolRow key={t.name} tool={t} policy={t.policy ?? policies[t.name] ?? null} />
            ))}
          </ul>
        )}
      </Section>

      <Section Icon={FlaskConical} title="Test packs" count={packs.length}>
        {packs.length === 0 ? (
          <EmptyState title="No test packs">Agents opt into shared packs with test_packs in their spec.</EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {packs.map((p) => (
              <article key={p.name} className="flex flex-col gap-1 rounded-md border bg-card p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-mono text-sm font-semibold">{p.name}</h3>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {p.templates} {p.templates === 1 ? 'template' : 'templates'}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{p.description}</p>
              </article>
            ))}
          </div>
        )}
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section Icon={Cpu} title="Model profiles" count={profiles.length}>
          {profiles.length === 0 ? (
            <EmptyState title="No model profiles" />
          ) : (
            <div className="overflow-x-auto rounded-md border bg-card">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/60 text-left">
                  <tr>
                    <th className="field-label px-3 py-2">Profile</th>
                    <th className="field-label px-3 py-2">Model</th>
                    <th className="field-label px-3 py-2 text-right">Temp</th>
                    <th className="field-label px-3 py-2 text-right">Max out</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {profiles.map(([name, p]) => (
                    <tr key={name}>
                      <td className="px-3 py-2.5 font-mono font-semibold">{name}</td>
                      <td className="px-3 py-2.5 font-mono text-xs break-all">{p?.model ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{p?.temperature ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{p?.maxOutputTokens?.toLocaleString() ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
        <Section Icon={Blocks} title="Instruction blocks" count={blocks.length}>
          {blocks.length === 0 ? (
            <EmptyState title="No instruction blocks" />
          ) : (
            <ul className="flex flex-col gap-2">
              {blocks.map((b) => (
                <li key={b.name}>
                  <details className="group rounded-md border bg-card">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2.5 font-mono text-sm font-semibold [&::-webkit-details-marker]:hidden">
                      <ChevronRight className="size-4 transition-transform group-open:rotate-90" strokeWidth={1.75} aria-hidden />
                      {b.name}
                      <span className="ml-auto font-sans text-xs font-normal text-muted-foreground">
                        {b.text.split('\n').filter(Boolean).length} lines
                      </span>
                    </summary>
                    <p className="border-t px-4 py-3 text-sm whitespace-pre-wrap text-muted-foreground">{b.text}</p>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}

export function LibraryView() {
  const { data: lib, error, refetch } = useData('library', getLibrary);
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Library</h1>
        <p className="max-w-[70ch] text-muted-foreground">
          Shared tools, policies, model profiles, instruction blocks and test packs. Agents reference these by name, so a
          policy defined once applies everywhere.
        </p>
        <StaleNotice error={lib ? error : null} onRetry={refetch} />
      </header>
      {lib ? (
        <LibraryBody lib={lib} />
      ) : error ? (
        <ErrorState title="Couldn't load the library" error={error} onRetry={refetch} />
      ) : (
        <LibrarySkeleton />
      )}
    </div>
  );
}
