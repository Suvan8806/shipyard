import { connection } from 'next/server';
import { CreateAgentBody } from '@/lib/contracts/api';
import { createAgent, listAgents } from '@/lib/services/agents';
import { actorOf, body, guard, handle } from '../_lib/http';

export async function GET() {
  await connection();
  return handle(() => listAgents());
}

export async function POST(req: Request) {
  return handle(async () => {
    guard(req, 'write');
    const data = await body(req, CreateAgentBody);
    return createAgent(data, actorOf(req));
  });
}
