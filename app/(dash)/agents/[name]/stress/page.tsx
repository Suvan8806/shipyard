'use client';
import { use } from 'react';
import { StressLab } from '@/components/shipyard/stress/stress-lab';

export default function StressLabPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  return <StressLab name={decodeURIComponent(name)} />;
}
