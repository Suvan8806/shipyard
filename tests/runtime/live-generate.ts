// Real-model check (not a vitest file): generate scenarios for support-agent with the careful profile.
// Run: npx tsx tests/runtime/live-generate.ts [count]
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { generateScenarios } from '../../lib/spec/generate';
import { validateSpec } from '../../lib/spec/validate';

try {
  process.loadEnvFile('.env.local');
} catch {
  /* already in env */
}

async function main() {
  const dir = path.join(process.cwd(), 'agents', 'support-agent');
  const v = validateSpec(fs.readFileSync(path.join(dir, 'spec.yaml'), 'utf8'), { 'x.yaml': 'name: x\nconversation: [{user: hi}]\nassert: [{reply_contains: hi}]' });
  if (!v.spec) throw new Error(JSON.stringify(v.errors));
  const t0 = Date.now();
  const out = await generateScenarios(v.spec, Number(process.argv[2] ?? 5));
  console.log(`generated ${out.length} valid scenarios in ${Date.now() - t0}ms`);
  for (const s of out) console.log('---\n' + YAML.stringify(s).slice(0, 700));
  process.exit(out.length ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
