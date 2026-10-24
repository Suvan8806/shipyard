// The live system DB (Supabase `sys` schema) as a SystemDb. Server-only; shares the pool in lib/db.ts.
import { getSql } from '../db';
import type { LiveDbFn, SystemDb } from '../types';

let instance: SystemDb | null = null;

export const liveDb: LiveDbFn = () => {
  if (instance) return instance;
  instance = {
    kind: 'live',
    async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
      const rows = await getSql().unsafe(text, params as never[]);
      return [...rows] as unknown as T[];
    },
    async exec(text: string): Promise<void> {
      await getSql().unsafe(text);
    },
  };
  return instance;
};
