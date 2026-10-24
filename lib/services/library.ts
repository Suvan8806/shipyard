import { BLOCKS, POLICIES, PROFILES, listTools } from '../library';
import { PACKS } from '../library/packs-loader';
import type { LibraryResponse, TestPackSummary } from '../contracts/api';

export function listTestPacks(): TestPackSummary[] {
  return PACKS.map((p) => ({ name: p.name, description: p.description, templates: p.templates.length }));
}

export async function getLibrary(): Promise<LibraryResponse> {
  return { tools: listTools(), profiles: PROFILES, blocks: BLOCKS, policies: POLICIES, packs: listTestPacks() };
}
