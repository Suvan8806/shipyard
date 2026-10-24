// Library barrel. Tools/profiles/policies: Lane A. Blocks: Lane E (./blocks). Packs: YAML files in ./packs.
// Server-side module (the pack loader reads the filesystem).
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { Block, TestPack } from '../types';
import * as blocksModule from './blocks';
import './tools'; // registers the 7 built-in tools

export { listTools, getTool, toolNames, defineTool, toWireName } from './registry';
export { PROFILES } from './profiles';
export { POLICIES } from './policies';

// blocks.ts exports Record<name, text> today (it may become Block[]); normalize to Block[].
const rawBlocks = (blocksModule as unknown as { BLOCKS: Record<string, string> | Block[] }).BLOCKS;
export const BLOCKS: Block[] = Array.isArray(rawBlocks)
  ? rawBlocks
  : Object.entries(rawBlocks).map(([name, text]) => ({ name, text }));

export function blockText(name: string): string | undefined {
  return BLOCKS.find((b) => b.name === name)?.text;
}

/** A pack as loaded from YAML; `defaults` holds placeholder values for template filling (Lane B). */
export type LoadedTestPack = TestPack & { defaults?: Record<string, string> };

function loadPacks(): LoadedTestPack[] {
  if (typeof window !== 'undefined') return [];
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
