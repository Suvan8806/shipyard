import { GENERATED_TESTS } from '@/lib/mock/fixtures';
import { GenerateTestsBody, type GenerateTestsResponse } from '@/lib/contracts/api';
import { ok, parseBody, requireAdmin } from '../../../_lib/http';

export const maxDuration = 120;

type Ctx = { params: Promise<{ name: string }> };

// W0 STUB: returns proposed scenarios (not saved). Lane C: generateScenarios(spec, count) -> YAML.
export async function POST(req: Request, ctx: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  await ctx.params;
  const { data, error } = await parseBody(req, GenerateTestsBody);
  if (error) return error;
  const entries = Object.entries(GENERATED_TESTS).slice(0, data.count);
  return ok<GenerateTestsResponse>({ scenarios: Object.fromEntries(entries) });
}
