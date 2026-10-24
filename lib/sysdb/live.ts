// W0 STUB (Lane A implements a SystemDb over SUPABASE_DB_URL, e.g. via lib/db.ts `sql.unsafe`).
import type { LiveDbFn } from '../types';

export const liveDb: LiveDbFn = () => ({
  kind: 'live',
  async query() {
    throw new Error('not implemented: lane A (liveDb.query)');
  },
  async exec() {
    throw new Error('not implemented: lane A (liveDb.exec)');
  },
});
