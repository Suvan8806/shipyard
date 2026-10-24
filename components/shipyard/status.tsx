import { CheckCircle2, CircleDashed, Loader2, OctagonX, TriangleAlert, FileEdit } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScenarioStatus, VersionStatus } from '@/lib/types';

export type AnyStatus = VersionStatus | ScenarioStatus | 'draft';

const STYLES: Record<AnyStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  live: { label: 'Live', cls: 'sy-pill-green', Icon: CheckCircle2 },
  passed: { label: 'Passed', cls: 'sy-pill-green', Icon: CheckCircle2 },
  blocked: { label: 'Blocked', cls: 'sy-pill-red', Icon: OctagonX },
  failed: { label: 'Failed', cls: 'sy-pill-red', Icon: OctagonX },
  running: { label: 'Running', cls: 'sy-pill-amber', Icon: Loader2 },
  error: { label: 'Error', cls: 'sy-pill-red', Icon: TriangleAlert },
  draft: { label: 'Draft', cls: 'sy-pill-grey', Icon: FileEdit },
};

/** Status pill used across the dashboard. Colors come from components/shipyard/shipyard.css. */
export function StatusPill({
  status,
  size = 'sm',
  className,
}: {
  status: AnyStatus;
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const s = STYLES[status] ?? { label: status, cls: 'sy-pill-grey', Icon: CircleDashed };
  return (
    <span
      className={cn(
        'sy-pill inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap',
        size === 'lg' ? 'px-3.5 py-1 text-base' : 'px-2 py-0.5 text-xs',
        s.cls,
        className,
      )}
    >
      <s.Icon className={cn(size === 'lg' ? 'size-4' : 'size-3', status === 'running' && 'animate-spin')} aria-hidden />
      {s.label}
    </span>
  );
}
