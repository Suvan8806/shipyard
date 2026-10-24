import * as repo from '../platform/repo';
import type { AuditRow } from '../contracts/api';

export async function listAudit(limit = 100): Promise<AuditRow[]> {
  return repo.listAudit(limit);
}
