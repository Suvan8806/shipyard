'use client';
import { use } from 'react';
import { GateBoard } from '@/components/shipyard/gate/gate-board';

export default function GatePage({ params }: { params: Promise<{ name: string; v: string }> }) {
  const { name, v } = use(params);
  return <GateBoard name={decodeURIComponent(name)} version={Number(v)} />;
}
