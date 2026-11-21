import { z } from 'zod';

/** R-VAL-R12 — headline: 1~120 chars, single line; >80 WARN (zod + rule). */
export const headlineSchema = z
	.string()
	.min(1)
	.max(120)
	.refine((s) => !/[\r\n]/.test(s), { message: '[R-VAL-R12] headline must be a single line' });

export const HEADLINE_WARN_LEN = 80;
export const HEADLINE_ERROR_LEN = 120;
