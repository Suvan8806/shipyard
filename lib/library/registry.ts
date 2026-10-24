// Tool registry (PRD 8.3). Tools register themselves via defineTool() in ./tools.ts.
import { z } from 'zod';
import type { ToolDef, ToolInfo } from '../types';
import { POLICIES } from './policies';

const REGISTRY = new Map<string, ToolDef>();

export function defineTool<P extends z.ZodTypeAny>(def: ToolDef<P>): ToolDef<P> {
  REGISTRY.set(def.name, def as unknown as ToolDef);
  return def;
}

export function getTool(name: string): ToolDef | undefined {
  return REGISTRY.get(name);
}

export function toolNames(): string[] {
  return [...REGISTRY.keys()];
}

function jsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  try {
    const out = { ...(z.toJSONSchema(schema) as Record<string, unknown>) };
    delete out.$schema;
    return out;
  } catch {
    return { type: 'object' };
  }
}

export function listTools(): ToolInfo[] {
  return [...REGISTRY.values()].map((t) => ({
    name: t.name,
    description: t.description,
    params: jsonSchema(t.params),
    policy: POLICIES[t.name] ?? null,
  }));
}

/** Provider-safe tool name (OpenAI/Groq reject dots): "accounts.get" -> "accounts_get". */
export const toWireName = (name: string) => name.replace(/\./g, '_');
