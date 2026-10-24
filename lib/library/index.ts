// Library barrel. Tools/profiles/policies: Lane A. Blocks: Lane E (./blocks).
// Client-safe: this barrel is reachable from the dashboard's mock backend (lib/mock/fixtures.ts), so it must not
// import node:fs. Test packs (YAML on disk) live in ./packs-loader (server-only): import PACKS from there.
import type { Block } from '../types';
import * as blocksModule from './blocks';
import './tools'; // registers the 7 built-in tools

export { listTools, getTool, toolNames, defineTool, toWireName } from './registry';
export { PROFILES } from './profiles';
export { POLICIES } from './policies';
export type { LoadedTestPack } from './packs-loader';

// blocks.ts exports Record<name, text> today (it may become Block[]); normalize to Block[].
const rawBlocks = (blocksModule as unknown as { BLOCKS: Record<string, string> | Block[] }).BLOCKS;
export const BLOCKS: Block[] = Array.isArray(rawBlocks)
  ? rawBlocks
  : Object.entries(rawBlocks).map(([name, text]) => ({ name, text }));

export function blockText(name: string): string | undefined {
  return BLOCKS.find((b) => b.name === name)?.text;
}
