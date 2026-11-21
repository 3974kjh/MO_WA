import { z } from 'zod';
import { charLength } from './charLength';

export const CALC_NOTE_MAX_LEN = 200;

/** R-VAL-P09 — calc_note optional; if present: one line, char_length ≤200. */
export const calcNoteSchema = z.string().superRefine((s, ctx) => {
	if (charLength(s) > CALC_NOTE_MAX_LEN) {
		ctx.addIssue({ code: 'custom', message: '[R-VAL-P09] calc_note must be ≤200 chars' });
	}
	if (/[\r\n]/.test(s)) {
		ctx.addIssue({ code: 'custom', message: '[R-VAL-P09] calc_note must be a single line' });
	}
});

export type ProposalChangeType = 'open_holding' | 'set_qty_avg' | 'close';
export type ProposedByType = 'bot' | 'user';
