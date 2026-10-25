'use client';
// Red-team result: attacks that broke through get the loud solid band and their failed end-state checks; attacks
// the agent held are quiet one-line rows. Every row links to its run trace.
import Link from 'next/link';
import { ArrowUpRight, CircleCheck, CircleDashed, OctagonX, ShieldCheck, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RedteamAttack, StressResult } from './contract';
import { Eyelet } from './shared';

const short = (s: string) => s.replace(/^redteam\//, '');

function BrokeThrough({ a }: { a: RedteamAttack }) {
  return (
    <article aria-label={`${short(a.scenario)} broke through`} className="overflow-hidden rounded-md border border-fail-border bg-card">
      <div className="flex items-center gap-2.5 bg-fail-solid px-3 py-2.5 text-fail-solid-foreground">
        <Eyelet className="size-7">
          <OctagonX className="size-4" strokeWidth={2} aria-hidden />
        </Eyelet>
        <span className="status-word text-xl sm:text-2xl">Broke through</span>
        <span className="ml-auto font-mono text-2xs">RT</span>
      </div>
      <div className="flex flex-col gap-2 p-3">
        <p className="text-lg font-semibold break-words">{short(a.scenario)}</p>
        <p className="text-sm text-muted-foreground">{a.description}</p>
        {a.failed_assertions.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="field-label">End state</span>
            <ul className="flex flex-col gap-0.5">
              {a.failed_assertions.map((f) => (
                <li key={f} className="font-mono text-sm break-words text-fail">
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}
        {a.run_id && (
          <Link href={`/runs/${a.run_id}`} className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline">
            View run trace <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </div>
    </article>
  );
}

function QuietRow({ a }: { a: RedteamAttack }) {
  const running = a.status === 'running';
  const error = a.status === 'error';
  const body = (
    <>
      <span className={cn('inline-flex w-28 shrink-0 items-center gap-1.5', running ? 'text-running' : error ? 'text-warn' : 'text-pass')}>
        {running ? (
          <CircleDashed className="size-4 animate-running-ring" strokeWidth={1.75} aria-hidden />
        ) : error ? (
          <TriangleAlert className="size-4" strokeWidth={1.75} aria-hidden />
        ) : (
          <CircleCheck className="size-4" strokeWidth={1.75} aria-hidden />
        )}
        <span className="status-word text-sm">{running ? 'Under test' : error ? 'Error' : 'Held'}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{short(a.scenario)}</span>
        <span className="block truncate text-xs text-muted-foreground">{a.description}</span>
      </span>
      {a.run_id && <ArrowUpRight className="size-4 shrink-0 text-primary" aria-hidden />}
    </>
  );
  return (
    <li>
      {a.run_id ? (
        <Link href={`/runs/${a.run_id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-accent">
          {body}
        </Link>
      ) : (
        <div className="flex items-center gap-3 px-3 py-2">{body}</div>
      )}
    </li>
  );
}

export function RedteamView({ r }: { r: StressResult }) {
  const rt = r.redteam;
  if (!rt) return null;
  const broke = rt.attacks.filter((a) => a.status === 'failed');
  const rest = [...rt.attacks.filter((a) => a.status !== 'failed')].sort(
    (a, b) => Number(b.status === 'running') - Number(a.status === 'running') || Number(b.status === 'error') - Number(a.status === 'error'),
  );
  const held = rt.attacks.filter((a) => a.status === 'passed').length;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-y py-4 text-base">
        <span className="text-muted-foreground">
          <span className="text-4xl font-bold tabular-nums text-foreground">{rt.generated}</span> attacks
        </span>
        <span className={cn('inline-flex items-baseline gap-1.5', broke.length ? 'text-fail' : 'text-muted-foreground')}>
          <OctagonX className="size-5 self-center" strokeWidth={1.75} aria-hidden />
          <span className="text-4xl font-bold tabular-nums">{broke.length}</span> broke through
        </span>
        <span className="inline-flex items-baseline gap-1.5 text-pass">
          <ShieldCheck className="size-5 self-center" strokeWidth={1.75} aria-hidden />
          <span className="text-2xl font-bold tabular-nums">{held}</span> held
        </span>
      </div>

      {broke.length > 0 && (
        <section aria-label="Attacks that broke through" className="grid gap-3 md:grid-cols-2">
          {broke.map((a) => (
            <BrokeThrough key={a.scenario} a={a} />
          ))}
        </section>
      )}
      {broke.length === 0 && r.status === 'done' && (
        <p className="flex items-center gap-2 rounded-md border border-pass-border bg-pass-subtle px-4 py-3 text-base font-semibold">
          <ShieldCheck className="size-5 text-pass" aria-hidden /> Every attack was held. The data stayed right in all {rt.generated} twins.
        </p>
      )}

      {rest.length > 0 && (
        <section aria-labelledby="held-attacks" className="flex flex-col gap-2">
          <h3 id="held-attacks" className="text-base font-semibold">
            {r.status === 'running' ? 'All attacks' : 'Held'} <span className="font-normal text-muted-foreground">· {rest.length}</span>
          </h3>
          <ul className="divide-y overflow-hidden rounded-md border bg-card">
            {rest.map((a) => (
              <QuietRow key={a.scenario} a={a} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
