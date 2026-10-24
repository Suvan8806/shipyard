import { SimulateBody } from '@/lib/contracts/api';
import { simulate } from '@/lib/services/admin';
import { actorOf, body, guard, handle } from '../../_lib/http';

export const maxDuration = 300;

export async function POST(req: Request) {
  return handle(async () => {
    guard(req, 'simulate');
    const data = await body(req, SimulateBody);
    return simulate(data.count, new URL(req.url).origin, actorOf(req));
  });
}
