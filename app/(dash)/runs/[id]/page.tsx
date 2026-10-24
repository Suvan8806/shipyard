'use client';
import { use } from 'react';
import { RunTraceView } from '@/components/shipyard/trace/run-trace';

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <RunTraceView id={decodeURIComponent(id)} />;
}
