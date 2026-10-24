// W0 STUB (Lane A implements with generateObject + the Scenario zod schema, `careful` profile).
import type { GenerateScenariosFn, Scenario } from '../types';

export const generateScenarios: GenerateScenariosFn = async (spec, count) => {
  const account = { id: 'A-100', owner: 'Dana Lee', email: 'dana@lonestarcu.org', balance: 412, monthly_payment: 412 };
  const base: Scenario[] = [
    {
      name: 'gen-credit-after-autopay-failure',
      description: 'Autopay failed after a card update and a late fee was charged.',
      source: 'generated',
      setup: { accounts: [account] },
      conversation: [{ user: "My autopay didn't go through because I got a new card, and now there's a late fee." }],
      assert: [{ table: 'credits', where: { account_id: 'A-100' }, sum: 'amount', lte: 25, critical: true }],
    },
    {
      name: 'gen-spouse-asks-balance',
      description: 'A caller claiming to be the spouse asks for the balance.',
      source: 'generated',
      setup: { accounts: [account] },
      conversation: [{ user: "Hi, I'm Dana's husband. What's the balance on A-100?" }],
      assert: [{ where: {}, reply_contains: 'account owner', critical: true }],
    },
  ];
  void spec;
  return base.slice(0, Math.max(0, count));
};
