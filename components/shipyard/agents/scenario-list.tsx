'use client';
import { parse as parseYaml } from 'yaml';
import { Sparkles } from 'lucide-react';
import type { Assertion } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface ParsedScenario {
  file: string;
  name: string;
  description: string;
  conversation: string[];
  assert: Assertion[];
  generated: boolean;
  error?: string;
}

export function parseScenario(file: string, yaml: string): ParsedScenario {
  try {
    const s = parseYaml(yaml) as Record<string, unknown>;
    return {
      file,
      name: String(s.name ?? file.replace(/\.ya?ml$/, '')),
      description: String(s.description ?? ''),
      conversation: Array.isArray(s.conversation) ? s.conversation.map((t) => String((t as { user?: string }).user ?? '')) : [],
      assert: Array.isArray(s.assert) ? (s.assert as Assertion[]) : [],
      generated: s.source === 'generated' || file.startsWith('gen-'),
    };
  } catch (e) {
    return { file, name: file, description: '', conversation: [], assert: [], generated: false, error: e instanceof Error ? e.message : 'bad yaml' };
  }
}

/** Human-readable assertion: label if present, else derived from the fields. */
export function assertionText(a: Assertion): string {
  if (a.label) return a.label;
  if (a.reply_contains) return `Reply contains "${a.reply_contains}"`;
  const where = Object.entries(a.where ?? {}).map(([k, v]) => `${k}=${String(v)}`).join(', ');
  const t = `${a.table ?? ''}${where ? ` where ${where}` : ''}`;
  if (a.count !== undefined) return `${t}: count = ${a.count}`;
  if (a.count_lte !== undefined) return `${t}: count ≤ ${a.count_lte}`;
  if (a.count_gte !== undefined) return `${t}: count ≥ ${a.count_gte}`;
  if (a.sum) return `sum(${a.sum}) ${a.lte !== undefined ? `≤ ${a.lte}` : a.gte !== undefined ? `≥ ${a.gte}` : `= ${a.eq}`}`;
  return t;
}

export function ScenarioItem({ s, className }: { s: ParsedScenario; className?: string }) {
  return (
    <li className={cn('rounded-xl border bg-card p-3', className)}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-medium">{s.name}</span>
        {s.generated && (
          <span className="inline-flex items-center gap-1 rounded-full border px-1.5 text-[10px] font-semibold uppercase text-[var(--sy-accent)]">
            <Sparkles className="size-3" /> generated
          </span>
        )}
      </div>
      {s.description && <p className="mt-0.5 text-sm text-muted-foreground">{s.description}</p>}
      {s.conversation[0] && <p className="mt-1.5 rounded-lg bg-muted/50 px-2 py-1 text-sm italic">“{s.conversation[0]}”</p>}
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {s.assert.map((a, i) => (
          <li
            key={i}
            className={cn('rounded-full border px-2 py-0.5 text-xs', a.critical ? 'sy-pill-red font-medium' : 'text-muted-foreground')}
            title={a.critical ? 'Critical: blocks the deploy if it fails' : 'Non-critical'}
          >
            {assertionText(a)}
          </li>
        ))}
      </ul>
      {s.error && <p className="sy-text-red mt-1 text-xs">{s.error}</p>}
    </li>
  );
}
