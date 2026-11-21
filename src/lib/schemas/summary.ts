import { z } from 'zod';

export const SUMMARY_MAX_LINES = 3;
export const SUMMARY_LINE_WARN_LEN = 120;

/** R-VAL-R04 — summary 1~3 lines; per-line >120 is WARN (rule layer). */
export const summarySchema = z.string().refine(
	(s) => {
		const lines = s.split('\n');
		return lines.length >= 1 && lines.length <= SUMMARY_MAX_LINES;
	},
	{ message: '[R-VAL-R04] summary must be 1–3 lines' }
);

export function summaryLines(summary: string): string[] {
	return summary.split('\n');
}
