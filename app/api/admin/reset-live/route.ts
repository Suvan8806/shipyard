import { reset } from '@/lib/services/admin';
import { actorOf, guard, handle } from '../../_lib/http';

export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(async () => {
    guard(req, 'write');
    return reset(actorOf(req));
  });
}
