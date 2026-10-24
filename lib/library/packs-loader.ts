// Server-only: loads lib/library/packs/*.yaml from disk. Kept out of the lib/library barrel so client bundles
// (components/shipyard -> lib/mock/fixtures -> lib/library) never pull in node:fs.
// Vercel: next.config.ts outputFileTracingIncludes ships the YAML files with every server function.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { TestPack } from '../types';

/** A pack as loaded from YAML; `defaults` holds placeholder values for template filling (Lane B). */
export type LoadedTestPack = TestPack & { defaults?: Record<string, string> };

function loadPacks(): LoadedTestPack[] {
  try {
    const dir = path.join(process.cwd(), 'lib', 'library', 'packs');
    return fs
      .readdirSync(dir)
      .filter((f) => /\.ya?ml$/.test(f))
      .sort()
      .map((f) => {
        const doc = YAML.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as LoadedTestPack;
        const templates = (doc.templates ?? []).map((t) => ({
          ...t,
          source: 'pack' as const,
          pack: doc.name,
          requires_tools: t.requires_tools ?? [],
          setup: t.setup ?? {},
          conversation: t.conversation ?? [],
          assert: t.assert ?? [],
        }));
        return { ...doc, templates };
      });
  } catch (e) {
    console.error('[library] failed to load test packs:', e instanceof Error ? e.message : e);
    return [];
  }
}

export const PACKS: LoadedTestPack[] = loadPacks();
