'use client';
// Small pieces shared by the stress lab and the version diff.
import Link from 'next/link';
import { ArrowLeft, Dices, FlaskConical, Layers, ServerOff, Swords } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ApiRequestError } from '../api';
import type { StressMode } from './contract';

export const MODE_META: Record<StressMode, { label: string; Icon: typeof Dices; blurb: string }> = {
  reliability: {
    label: 'Reliability',
    Icon: Dices,
    blurb: 'Run every test several times. A test that passes once and fails once is flaky, and flaky means not safe.',
  },
  redteam: {
    label: 'Red-team swarm',
    Icon: Swords,
    blurb: 'Generate fresh attacks against this agent (injection, social engineering, money tricks) and check the data after each one.',
  },
  matrix: {
    label: 'Model matrix',
    Icon: Layers,
    blurb: 'Run the whole suite on 2 to 4 models side by side. See which one keeps the data right, and what it costs.',
  },
};

/**
 * True when the server has no stress/diff routes yet: a framework 404 (HTML body, so no `not_found` code), as
 * opposed to our API's JSON `not_found` for an unknown agent or stress id.
 */
export function isNotDeployed(e: unknown): boolean {
  return e instanceof ApiRequestError && e.status === 404 && e.code !== 'not_found';
}

export function NotDeployed({ what = 'Stress lab' }: { what?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-6 py-12 text-center">
      <ServerOff className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-lg font-semibold text-balance">{what} isn&apos;t deployed on this server yet.</p>
      <p className="max-w-prose text-sm text-muted-foreground">
        This build of the dashboard knows about it, but the API it talks to doesn&apos;t have the route. Deploy the dev branch, or
        run the dashboard with <span className="font-mono">NEXT_PUBLIC_USE_MOCKS=1</span> to see it with sample data.
      </p>
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden /> {children}
    </Link>
  );
}

/** The tag eyelet (design/direction.md 7.1): the band's leading icon in a punched ring. */
export function Eyelet({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('grid size-[22px] shrink-0 place-items-center rounded-full border-[1.5px] border-current/60', className)}>
      {children}
    </span>
  );
}

export function PageTitle({ name, title, children }: { name: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="board-title flex flex-wrap items-center gap-x-3 gap-y-1 text-3xl sm:text-4xl">
        <FlaskConical className="size-6 text-muted-foreground" strokeWidth={1.75} aria-hidden />
        <span>{title}</span>
        <span className="font-mono text-lg font-semibold text-muted-foreground break-all">{name}</span>
      </h1>
      {children && <p className="max-w-prose text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}
