// W0 STUB (Lane B implements, PRD 12). Returns the blocked/live fixture so C/D can work end to end.
import type { RunGateFn } from '../types';
import { GATE_BLOCKED, GATE_LIVE } from '../mock/fixtures';

export const runGate: RunGateFn = async ({ agent, version }) => {
  // Even versions block, odd versions go live: enough to exercise both UI paths.
  const base = version % 2 === 0 ? GATE_BLOCKED : GATE_LIVE;
  return { ...base, agent, version, current_version: version % 2 === 0 ? Math.max(1, version - 1) : version };
};
