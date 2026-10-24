// Zod schemas for agent specs (PRD 7) and scenarios/assertions (PRD 10.1, 10.2).
// Library membership (tools, blocks, profiles) and table/column allowlists are checked in validate.ts.
import { z } from 'zod';

const Scalar = z.union([z.string(), z.number(), z.boolean()]);

/** The single "check" of an assertion. `sum` pairs with exactly one of lte/gte/eq. body_contains is a filter. */
export const CHECK_KEYS = ['count', 'count_gte', 'count_lte', 'sum', 'reply_contains', 'reply_not_contains'] as const;
export const COMPARATORS = ['lte', 'gte', 'eq'] as const;

export const AssertionSchema = z
  .object({
    table: z.string().optional(),
    where: z.record(z.string(), Scalar).default({}),
    body_contains: z.string().min(1).optional(),
    count: z.number().int().min(0).optional(),
    count_gte: z.number().int().min(0).optional(),
    count_lte: z.number().int().min(0).optional(),
    sum: z.string().optional(),
    lte: z.number().optional(),
    gte: z.number().optional(),
    eq: z.number().optional(),
    reply_contains: z.string().min(1).optional(),
    reply_not_contains: z.string().min(1).optional(),
    critical: z.boolean().default(false),
    label: z.string().optional(),
  })
  .superRefine((a, ctx) => {
    const checks = CHECK_KEYS.filter((k) => a[k] !== undefined);
    const comps = COMPARATORS.filter((k) => a[k] !== undefined);
    if (checks.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: `exactly one check is required (one of ${CHECK_KEYS.join(', ')}); found ${checks.length ? checks.join(', ') : 'none'}`,
      });
      return;
    }
    const check = checks[0];
    if (check === 'sum' && comps.length !== 1) {
      ctx.addIssue({ code: 'custom', message: 'sum needs exactly one of lte, gte or eq' });
    }
    if (check !== 'sum' && comps.length > 0) {
      ctx.addIssue({ code: 'custom', message: `${comps.join(', ')} only applies with sum` });
    }
    const isReply = check === 'reply_contains' || check === 'reply_not_contains';
    if (!isReply && !a.table) ctx.addIssue({ code: 'custom', message: `${check} needs a table`, path: ['table'] });
  });

const Row = z.record(z.string(), z.unknown());

export const ScenarioSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9/-]{1,79}$/, 'lowercase letters, digits and dashes'),
  description: z.string().default(''),
  source: z.enum(['spec', 'pack', 'generated']).optional(),
  setup: z.record(z.string(), z.array(Row)).default({}),
  conversation: z.array(z.object({ user: z.string().min(1) })).min(1, 'at least one user turn'),
  assert: z.array(AssertionSchema).min(1, 'at least one assertion'),
});

export const GateConfigSchema = z.object({
  min_pass_rate: z.number().min(0).max(1).default(1),
  runs_per_scenario: z.number().int().min(1).max(5).default(1),
  variants: z.number().int().min(0).max(5).default(0),
});

export const AgentSpecSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]{2,40}$/, 'slug: 2-40 lowercase letters, digits or dashes'),
  goal: z.string().min(1),
  profile: z.string().min(1),
  inherit: z.array(z.string()).default([]),
  tools: z.array(z.string()).min(1, 'at least one tool'),
  instructions: z.string().default(''),
  test_packs: z.array(z.string()).default([]),
  gate: GateConfigSchema.default({ min_pass_rate: 1, runs_per_scenario: 1, variants: 0 }),
});

export type AssertionIn = z.infer<typeof AssertionSchema>;
export type ScenarioIn = z.infer<typeof ScenarioSchema>;
export type AgentSpecIn = z.infer<typeof AgentSpecSchema>;
