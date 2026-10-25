import { AgentPage, type PackTemplates } from '@/components/shipyard/agents/agent-page';
import { loadPacks } from '@/lib/gate/packs';

/** Each pack's templates with their requires_tools, so the client counts tests the same way the gate expands packs. */
function packTemplates(): PackTemplates | undefined {
  try {
    return Object.fromEntries(loadPacks().map((p) => [p.name, p.templates.map((t) => ({ name: t.name, requires_tools: t.requires_tools }))]));
  } catch {
    return undefined; // the client falls back to the library's raw template counts
  }
}

export default async function AgentRoute({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return <AgentPage name={decodeURIComponent(name)} packTemplates={packTemplates()} />;
}
