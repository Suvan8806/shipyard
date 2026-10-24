'use client';
import { ChevronRight, FlaskConical, Wrench, Cpu, Blocks } from 'lucide-react';
import type { Policy } from '@/lib/types';
import { getLibrary } from '../api';
import { useData } from '../use-data';

export function policyChips(p: Policy | null): string[] {
  if (!p) return [];
  const chips: string[] = [];
  if (p.maxAmount !== undefined) chips.push(`max $${p.maxAmount}`);
  if (p.maxCallsPerRun !== undefined) chips.push(`${p.maxCallsPerRun} per run`);
  if (p.requiresApproval) chips.push('needs approval');
  if (p.blockExternalIfContains?.length) chips.push('no external w/ account data');
  if (p.allowedAgents?.length) chips.push(`only ${p.allowedAgents.join(', ')}`);
  return chips;
}

function paramNames(schema: Record<string, unknown>): string[] {
  const props = schema.properties as Record<string, unknown> | undefined;
  return props ? Object.keys(props) : [];
}

function SectionTitle({ Icon, title, count }: { Icon: typeof Wrench; title: string; count: number }) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-semibold">
      <Icon className="size-5 text-muted-foreground" /> {title} <span className="text-sm font-normal text-muted-foreground">{count}</span>
    </h2>
  );
}

export function LibraryView() {
  const { data: lib, error } = useData('library', getLibrary);
  if (error) return <p className="sy-pill-red rounded-xl border p-4">Could not load the library: {error.message}</p>;
  if (!lib) return <div className="mx-auto h-96 max-w-7xl animate-pulse rounded-2xl bg-muted" />;
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Library</h1>
        <p className="text-muted-foreground">Shared tools, policies, model profiles, instruction blocks and test packs. Agents reference these by name.</p>
      </header>

      <section className="flex flex-col gap-3">
        <SectionTitle Icon={Wrench} title="Tools" count={lib.tools.length} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lib.tools.map((t) => (
            <article key={t.name} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
              <h3 className="font-mono text-sm font-semibold">{t.name}</h3>
              <p className="text-sm text-muted-foreground">{t.description}</p>
              {paramNames(t.params).length > 0 && (
                <p className="font-mono text-xs text-muted-foreground">({paramNames(t.params).join(', ')})</p>
              )}
              <div className="mt-auto flex flex-wrap gap-1.5">
                {policyChips(t.policy).map((c) => (
                  <span key={c} className="sy-pill-amber rounded-full border px-2 py-0.5 text-xs font-medium">
                    {c}
                  </span>
                ))}
                {!t.policy && <span className="text-xs text-muted-foreground">no policy</span>}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle Icon={FlaskConical} title="Test packs" count={lib.packs.length} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lib.packs.map((p) => (
            <article key={p.name} className="rounded-xl border bg-card p-4">
              <div className="flex items-baseline justify-between">
                <h3 className="font-mono text-sm font-semibold">{p.name}</h3>
                <span className="font-mono text-xs text-muted-foreground">{p.templates} templates</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <SectionTitle Icon={Cpu} title="Model profiles" count={Object.keys(lib.profiles).length} />
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Profile</th>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 text-right font-medium">Temp</th>
                  <th className="px-3 py-2 text-right font-medium">Max out</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {Object.entries(lib.profiles).map(([name, p]) => (
                  <tr key={name}>
                    <td className="px-3 py-2 font-mono font-medium">{name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.model}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.temperature}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.maxOutputTokens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="flex flex-col gap-3">
          <SectionTitle Icon={Blocks} title="Instruction blocks" count={lib.blocks.length} />
          <ul className="flex flex-col gap-2">
            {lib.blocks.map((b) => (
              <li key={b.name}>
                <details className="group rounded-xl border bg-card">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 font-mono text-sm font-medium">
                    <ChevronRight className="size-4 transition-transform group-open:rotate-90" /> {b.name}
                  </summary>
                  <p className="px-4 pb-3 text-sm whitespace-pre-wrap text-muted-foreground">{b.text}</p>
                </details>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
