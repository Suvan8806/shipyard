'use client';
import { use } from 'react';
import { StressResultPage } from '@/components/shipyard/stress/stress-result';

export default function StressRunPage({ params }: { params: Promise<{ name: string; id: string }> }) {
  const { name, id } = use(params);
  return <StressResultPage name={decodeURIComponent(name)} id={decodeURIComponent(id)} />;
}
