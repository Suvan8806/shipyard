'use client';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CircleDashed, FlaskConical, Loader2, Rocket } from 'lucide-react';
import type { AgentDetail } from '@/lib/contracts/api';
import type { ValidationResult } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Flap } from '../flap';
import { StatusPill } from '../status';
import { GenerateTestsDialog } from './generate-tests-dialog';
import type { SaveState } from './spec-editor';
import { useDeploy } from './use-deploy';
import { GATE_ERROR_COPY } from './versions-table';

/** Why Deploy is disabled, or null when it can run. */
function blockReason(validation: ValidationResult | null, save: SaveState): string | null {
  if (save === 'error') return 'Save the draft to deploy';
  if (save === 'pending' || save === 'saving') return 'Saving the draft…';
  if (!validation) return 'Checking the spec…';
  if (!validation.ok) {
    const n = validation.errors.length;
    return `Fix ${n} ${n === 1 ? 'error' : 'errors'} to deploy`;
  }
  return null;
}

export function AgentHeader({
  d,
  validation,
  save,
  onScenariosChanged,
}: {
  d: AgentDetail;
  validation: ValidationResult | null;
  save: SaveState;
  onScenariosChanged: () => void;
}) {
  const running = d.versions.find((v) => v.status === 'running') ?? null;
  const latest = d.versions[0] ?? null;
  const { busy, start } = useDeploy(d.name, running?.version ?? null);
  const reason = blockReason(validation, save);
  const enc = encodeURIComponent(d.name);

  return (
    <header className="flex flex-col gap-3">
      <Link href="/agents" className="inline-flex w-fit items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Agents
      </Link>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="board-title text-3xl break-all sm:text-4xl">{d.name}</h1>
            {d.current_version !== null ? (
              <span className="inline-flex items-center gap-1.5">
                <Flap text={`v${d.current_version}`} tone="signal" className="text-[1.6rem]" label={`version ${d.current_version}`} />
                <StatusPill status="live" size="lg" />
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <StatusPill status="draft" size="lg" />
                <span className="text-sm text-muted-foreground">not serving yet</span>
              </span>
            )}
          </div>
          <p className="text-base text-muted-foreground">
            <span className="font-bold text-foreground">{d.team ?? 'No team'}</span> · owner {d.owner ?? 'unassigned'}
          </p>
          {latest && latest.status === 'error' && latest.version !== d.current_version && (
            <p className="text-sm text-warn">
              <Link href={`/agents/${enc}/versions/${latest.version}`} className="font-mono font-semibold hover:underline">
                v{latest.version}
              </Link>
              : {GATE_ERROR_COPY}
            </p>
          )}
          {latest && latest.status === 'blocked' && latest.version !== d.current_version && (
            <p className="inline-flex w-fit flex-wrap items-center gap-x-1.5 rounded-sm bg-fail-subtle px-2 py-1 text-sm text-fail">
              <Link href={`/agents/${enc}/versions/${latest.version}`} className="font-mono font-bold underline underline-offset-4">
                v{latest.version}
              </Link>{' '}
              was blocked by the gate.{' '}
              {d.current_version !== null ? `v${d.current_version} is still serving.` : 'Nothing was deployed.'}
            </p>
          )}
        </div>

        <div className="flex w-full flex-col gap-1.5 sm:ml-auto sm:w-auto sm:items-end">
          <div className="flex flex-wrap items-center gap-2">
            {running && (
              <Link
                href={`/agents/${enc}/versions/${running.version}`}
                className="inline-flex items-center gap-1.5 rounded-sm bg-board px-2.5 py-2 text-sm font-bold text-board-ink hover:bg-board-raised"
              >
                <CircleDashed className="size-3.5 animate-running-ring text-running-lamp" aria-hidden />
                Watch v{running.version} gate <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            )}
            <Button variant="outline" nativeButton={false} render={<Link href={`/agents/${enc}/stress`} />}>
              <FlaskConical aria-hidden /> Stress lab
            </Button>
            <GenerateTestsDialog name={d.name} onAccepted={onScenariosChanged} />
            <Button
              size="lg"
              onClick={() => void start()}
              disabled={busy || reason !== null}
              title={reason ?? 'Run the gate on a new version'}
              aria-describedby={reason ? 'deploy-reason' : undefined}
            >
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Rocket aria-hidden />}
              {busy ? 'Deploying…' : 'Deploy'}
            </Button>
          </div>
          {reason && !busy && (
            <p id="deploy-reason" className="text-xs text-muted-foreground">
              {reason}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}
