import { notFound } from 'next/navigation';
import { GateBoard } from '@/components/shipyard/gate/gate-board';

export default async function GatePage({ params }: { params: Promise<{ name: string; v: string }> }) {
  const { name, v } = await params;
  // A non-numeric version can never exist: real 404 before any fetch. Missing versions 404 on the client.
  if (!/^[1-9]\d*$/.test(v)) notFound();
  return <GateBoard name={decodeURIComponent(name)} version={Number(v)} />;
}
