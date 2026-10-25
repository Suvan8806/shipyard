// Demo reset: live-created agents are purged, the 8 seeded agents' history is never touched.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEEDED_AGENTS, purgeUnseededStatements, resetLiveStatements } from '@/lib/library/reset';

describe('reset-live purge', () => {
  it('SEEDED_AGENTS matches the agents/ folders', () => {
    const dir = path.resolve(__dirname, '../../agents');
    const folders = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'spec.yaml')))
      .map((d) => d.name)
      .sort();
    expect([...SEEDED_AGENTS].sort()).toEqual(folders);
  });

  it('every purge statement is scoped to agents NOT in the seeded set', () => {
    const stmts = purgeUnseededStatements();
    expect(stmts).toHaveLength(4);
    for (const s of stmts) {
      expect(s).toMatch(/^delete from public\./);
      expect(s).toContain('not in (');
      for (const name of SEEDED_AGENTS) expect(s).toContain(`'${name}'`);
    }
    // agents go last so the subselects in the earlier deletes still see the doomed names
    expect(stmts[stmts.length - 1]).toMatch(/^delete from public\.agents where name not in/);
  });

  it('is on by default and can be turned off', () => {
    const purge = purgeUnseededStatements();
    expect(resetLiveStatements()).toEqual(expect.arrayContaining(purge));
    const kept = resetLiveStatements({ purgeUnseeded: false });
    for (const s of purge) expect(kept).not.toContain(s);
  });
});
