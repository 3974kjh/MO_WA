import { z } from 'zod';

/** R-VAL-R15 — equity_analysis meta context keys + alignment enum. */
export const alignmentValues = ['aligned', 'partial', 'conflict', 'unchecked'] as const;

export const equityContextKeys = [
	'selection_reason',
	'reason_source',
	'alignment',
	'align_reason',
	'lenses'
] as const;

export const lensesSchema = z
	.object({
		social: z.unknown().optional(),
		corporate: z.unknown().optional(),
		policy: z.unknown().optional()
	})
	.strict();

export const equityAnalysisContextSchema = z
	.object({
		selection_reason: z.string().optional(),
		reason_source: z.string().optional(),
		alignment: z.enum(alignmentValues).optional(),
		align_reason: z.string().optional(),
		lenses: lensesSchema.optional()
	})
	.strict();

/** Keys that must not appear on non-equity_analysis kinds (R-VAL-R15). */
export const equityContextKeySet = new Set<string>(equityContextKeys);

export type EquityAnalysisContext = z.infer<typeof equityAnalysisContextSchema>;
export type Alignment = (typeof alignmentValues)[number];
