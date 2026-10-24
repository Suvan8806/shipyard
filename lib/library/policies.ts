// Per-tool policies (PRD 8.5), enforced in code by lib/runtime/policy.ts before any handler runs.
import type { Policy } from '../types';

export const POLICIES: Record<string, Policy> = {
  'payments.defer': { requiresApproval: true },
  'accounts.apply_credit': { maxAmount: 25, maxCallsPerRun: 1 },
  'email.send': { blockExternalIfContains: ['account_id', 'balance'] },
};
