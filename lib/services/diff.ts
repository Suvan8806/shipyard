// Version diff: spec line diff (LCS) + per-scenario status changes between two deployed versions.
import * as repo from '../platform/repo';
import type { VersionDiff } from '../contracts/stress';
import { lineDiff, scenarioChanges, scenarioStatuses } from '../stress/math';
import { ServiceError, notFound } from './errors';
import { requireAgent } from './agents';

export async function getVersionDiff(name: string, from: number, to: number): Promise<VersionDiff> {
  for (const [k, v] of [['from', from], ['to', to]] as const) {
    if (!Number.isInteger(v) || v < 1) throw new ServiceError('bad_request', `${k} must be a positive version number`);
  }
  await requireAgent(name);
  const [a, b] = await Promise.all([repo.getVersion(name, from), repo.getVersion(name, to)]);
  if (!a) throw notFound(`version ${from} of ${name}`);
  if (!b) throw notFound(`version ${to} of ${name}`);
  const [ra, rb] = await Promise.all([repo.listScenarioResults(name, from), repo.listScenarioResults(name, to)]);
  return {
    from,
    to,
    spec_diff: lineDiff(a.spec_yaml, b.spec_yaml),
    scenarios: scenarioChanges(scenarioStatuses(ra), scenarioStatuses(rb)),
  };
}
