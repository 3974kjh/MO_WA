import { z } from 'zod';

/** R-VAL-R14 — meta.candidates[] keys fixed (Q-19). */
export const candidateKeys = [
	'rank',
	'ticker',
	'close',
	'l1',
	'l2',
	'stop',
	'confidence',
	'reason'
] as const;

export const candidateSchema = z
	.object({
		rank: z.number(),
		ticker: z.string().min(1),
		close: z.number().positive(),
		l1: z.number().positive(),
		l2: z.number().positive(),
		stop: z.number().positive(),
		confidence: z.number(),
		reason: z.string()
	})
	.strict();

export const candidatesMetaSchema = z.object({
	candidates: z.array(candidateSchema)
});

export type Candidate = z.infer<typeof candidateSchema>;
