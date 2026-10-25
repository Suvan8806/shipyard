import { CircleCheck, CircleDashed, Lock, OctagonX, PencilLine, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScenarioStatus, VersionStatus } from '@/lib/types';

export type AnyStatus = VersionStatus | ScenarioStatus | 'draft';

// Departures: every status is a board chip: a black cell with a lit lamp icon (distinct shape) and the word in
// board caps. Blocked and failed are solid red cells so they read from the back of the room.
const STYLES: Record<AnyStatus, { label: string; cls: string; Icon: typeof CircleCheck }> = {
  live: { label: 'Live', cls: 'bg-board text-pass-lamp', Icon: CircleCheck },
  passed: { label: 'Passed', cls: 'bg-board text-pass-lamp', Icon: CircleCheck },
  blocked: { label: 'Blocked', cls: 'bg-blocked-solid text-blocked-solid-foreground', Icon: Lock },
  failed: { label: 'Failed', cls: 'bg-fail-solid text-fail-solid-foreground', Icon: OctagonX },
  running: { label: 'Running', cls: 'bg-board text-running-lamp', Icon: CircleDashed },
  error: { label: 'Error', cls: 'bg-board text-warn-lamp', Icon: TriangleAlert },
  draft: { label: 'Draft', cls: 'bg-board text-board-muted', Icon: PencilLine },
};

/** Status chip used across the dashboard (token classes from app/globals.css). */
export function StatusPill({
  status,
  size = 'sm',
  label,
  className,
}: {
  status: AnyStatus;
  size?: 'sm' | 'lg';
  /** Overrides the status word (e.g. "Live v3"). */
  label?: string;
  className?: string;
}) {
  const s = STYLES[status] ?? { label: String(status), cls: 'bg-board text-board-muted', Icon: CircleDashed };
  return (
    <span
      className={cn(
        'status-word inline-flex items-center gap-1.5 rounded-sm whitespace-nowrap',
        size === 'lg' ? 'px-2.5 py-1.5 text-base' : 'px-1.5 py-1 text-[0.8125rem]',
        s.cls,
        className,
      )}
    >
      <s.Icon
        className={cn(size === 'lg' ? 'size-4' : 'size-3.5', status === 'running' && 'animate-running-ring')}
        strokeWidth={2.25}
        aria-hidden
      />
      {label ?? s.label}
    </span>
  );
}
