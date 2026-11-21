import { z } from 'zod';

/**
 * buy_plan meta stub until Q-33 (design §3-5).
 * Free-form object; no fixed keys in M1.
 */
export const buyPlanMetaSchema = z.record(z.string(), z.unknown());

export type BuyPlanMeta = z.infer<typeof buyPlanMetaSchema>;
