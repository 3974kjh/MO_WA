import { z } from 'zod';

/**
 * buy_plan meta stub until Q-33 (design §3-5 / M-1).
 * Free-form; no R-VAL rule ID applies. Always accept (no check).
 */
export const buyPlanMetaSchema = z.record(z.string(), z.unknown()).optional().nullable();

export type BuyPlanMeta = z.infer<typeof buyPlanMetaSchema>;
