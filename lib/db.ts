// Server-side Postgres connection to Supabase (platform tables in `public`, live system in `sys`).
// Owned by O0. Lazily created so importing this module never needs env vars (build stays green).
//
// Note: we deliberately do NOT `import 'server-only'` here, because tsx scripts (seed, simulate)
// and vitest also import the repo, and `server-only` throws outside the react-server condition.
// The browser guard below gives the same protection for client bundles.
import postgres from 'postgres';

export type Sql = postgres.Sql;

let instance: Sql | null = null;

function create(): Sql {
  if (typeof window !== 'undefined') {
    throw new Error('lib/db.ts is server-only and must not be imported in client components');
  }
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      'SUPABASE_DB_URL is not set. Add the Supabase transaction pooler URL to .env.local (see .env.example).',
    );
  }
  // prepare:false is required by the Supabase transaction pooler (pgbouncer).
  return postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
}

/** The shared connection. Created on first use; throws a clear error if SUPABASE_DB_URL is missing. */
export function getSql(): Sql {
  if (!instance) instance = create();
  return instance;
}

/**
 * Tagged-template proxy over the lazy singleton, so callers can write `sql\`select 1\``
 * and `sql.json(...)`, `sql.unsafe(...)`, `sql.begin(...)` without touching env at import time.
 */
export const sql: Sql = new Proxy((() => undefined) as unknown as Sql, {
  apply(_target, _thisArg, args: unknown[]) {
    return (getSql() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_target, prop) {
    const real = getSql() as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

/** Close the pool (scripts call this before exiting). */
export async function closeSql(): Promise<void> {
  if (instance) {
    const s = instance;
    instance = null;
    await s.end({ timeout: 5 });
  }
}
