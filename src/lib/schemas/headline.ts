import { z } from 'zod';
import { charLength } from './charLength';

export const HEADLINE_WARN_LEN = 80;
export const HEADLINE_ERROR_LEN = 120;

/**
 * R-VAL-R12 — headline: DB uses `char_length` 1~120, no newlines.
 * Empty string fails the DB CHECK (length >= 1); treat as ERROR, not "absent".
 */
export const headlineSchema = z.string().superRefine((s, ctx) => {
	const len = charLength(s);
	if (len < 1) {
		ctx.addIssue({ code: 'custom', message: '[R-VAL-R12] headline must be 1–120 chars' });
		return;
	}
	if (len > HEADLINE_ERROR_LEN) {
		ctx.addIssue({ code: 'custom', message: '[R-VAL-R12] headline must be 1–120 chars' });
	}
	if (/[\r\n]/.test(s)) {
		ctx.addIssue({ code: 'custom', message: '[R-VAL-R12] headline must be a single line' });
	}
});
