import * as repo from '../platform/repo';
import type { RunListItem, RunTrace } from '../contracts/api';
import type { RunMode } from '../types';
import { notFound } from './errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listRuns(opts: { limit?: number; agent?: string; mode?: RunMode } = {}): Promise<RunListItem[]> {
  return repo.listRuns(opts);
}

export async function getRunTrace(id: string): Promise<RunTrace> {
  if (!UUID_RE.test(id)) throw notFound(`run ${id}`);
  const run = await repo.getRun(id);
  if (!run) throw notFound(`run ${id}`);
  const [events, sr] = await Promise.all([repo.listEvents(id), repo.getScenarioResultByRun(id)]);
  return {
    run,
    events,
    diff: sr?.diff ?? null,
    before_snapshot: sr?.before_snapshot ?? null,
    after_snapshot: sr?.after_snapshot ?? null,
  };
}
