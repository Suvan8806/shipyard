import { ChatBody } from '@/lib/contracts/api';
import { chat } from '@/lib/services/chat';
import { body, guard, handle } from '../../../_lib/http';

export const maxDuration = 60;

type Ctx = { params: Promise<{ name: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { name } = await ctx.params;
  return handle(async () => {
    guard(req, 'chat');
    const data = await body(req, ChatBody);
    return chat(name, data.messages);
  });
}
