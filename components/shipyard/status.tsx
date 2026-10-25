import { CircleCheck, CircleDashed, Lock, OctagonX, PencilLine, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScenarioStatus, VersionStatus } from '@/lib/types';

export type AnyStatus = VersionStatus | ScenarioStatus | 'draft';

// design/direction.md 4.3: every status = icon (distinct shape) + word + color. Blocked and failed are solid.
const STYLES: Record<AnyStatus, { label: string; cls: string; Icon: typeof CircleCheck }> = {
  live: { label: 'Live', cls: 'bg-pass-subtle text-pass border-pass-border', Icon: CircleCheck },
  passed: { label: 'Passed', cls: 'bg-pass-subtle text-pass border-pass-border', Icon: CircleCheck },
  blocked: { label: 'Blocked', cls: 'bg-blocked-solid text-blocked-solid-foreground border-blocked-solid', Icon: Lock },
  failed: { label: 'Failed', cls: 'bg-fail-solid text-fail-solid-foreground border-fail-solid', Icon: OctagonX },
  running: { label: 'Running', cls: 'bg-running-subtle text-running border-running-border', Icon: CircleDashed },
  error: { label: 'Error', cls: 'bg-warn-subtle text-warn border-warn-border', Icon: TriangleAlert },
  draft: { label: 'Draft', cls: 'bg-draft-subtle text-draft border-border', Icon: PencilLine },
};

/** Status pill used across the dashboard (token classes from app/globals.css). */
export function StatusPill({
  status,
  size = 'sm',
  className,
}: {
  status: AnyStatus;
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const s = STYLES[status] ?? { label: String(status), cls: 'bg-draft-subtle text-draft border-border', Icon: CircleDashed };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border font-semibold whitespace-nowrap',
        size === 'lg' ? 'px-2.5 py-1 text-sm' : 'px-1.5 py-0.5 text-xs',
        s.cls,
        className,
      )}
    >
      <s.Icon
        className={cn(size === 'lg' ? 'size-4' : 'size-3', status === 'running' && 'animate-running-ring')}
        strokeWidth={2}
        aria-hidden
      />
      {s.label}
    </span>
  );
}
