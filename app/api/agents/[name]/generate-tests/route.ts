import { GenerateTestsBody } from '@/lib/contracts/api';
import { generateTests } from '@/lib/services/tests';
import { body, guard, handle } from '../../../_lib/http';

export const maxDuration = 120;

type Ctx = { params: Promise<{ name: string }> };

// Returns proposed scenarios (filename -> YAML). Not saved; the UI accepts them into the draft.
export async function POST(req: Request, ctx: Ctx) {
  const { name } = await ctx.params;
  return handle(async () => {
    guard(req, 'generate');
    const data = await body(req, GenerateTestsBody);
    return generateTests(name, data.count);
  });
}
