// Generated tests: the careful model proposes scenarios for an agent's draft; returned as YAML (not saved).
import { generateScenarios } from '../spec/generate';
import type { GenerateTestsResponse } from '../contracts/api';
import { ServiceError } from './errors';
import { requireAgent } from './agents';
import { looseSpec, scenarioToYaml } from './spec';
import { validateSpec } from '../spec/validate';

export async function generateTests(name: string, count: number): Promise<GenerateTestsResponse> {
  const agent = await requireAgent(name);
  let spec;
  try {
    spec = validateSpec(agent.draft_spec_yaml, agent.draft_scenarios).spec ?? looseSpec(agent.draft_spec_yaml);
  } catch (e) {
    throw new ServiceError('invalid_spec', `could not parse the draft spec: ${e instanceof Error ? e.message : String(e)}`);
  }
  const generated = await generateScenarios(spec, Math.min(Math.max(count, 1), 20));
  const out: Record<string, string> = {};
  for (const s of generated) {
    const base = (s.name.startsWith('gen-') ? s.name : `gen-${s.name}`).replace(/[^a-z0-9-]/g, '-').slice(0, 60);
    let file = `${base}.yaml`;
    for (let i = 2; out[file] || agent.draft_scenarios[file]; i++) file = `${base}-${i}.yaml`;
    out[file] = scenarioToYaml({ ...s, name: file.replace(/\.yaml$/, '') });
  }
  return { scenarios: out };
}
