import { z } from 'zod';

export const CALC_NOTE_MAX_LEN = 200;

/** R-VAL-P09 — calc_note optional; if present: one line, ≤200. */
export const calcNoteSchema = z
	.string()
	.max(CALC_NOTE_MAX_LEN)
	.refine((s) => !/[\r\n]/.test(s), { message: '[R-VAL-P09] calc_note must be a single line' });

export type ProposalChangeType = 'open_holding' | 'set_qty_avg' | 'close';
export type ProposedByType = 'bot' | 'user';
