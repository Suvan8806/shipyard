'use client';
import { use } from 'react';
import { AgentPage } from '@/components/shipyard/agents/agent-page';

export default function AgentRoute({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  return <AgentPage name={decodeURIComponent(name)} />;
}
