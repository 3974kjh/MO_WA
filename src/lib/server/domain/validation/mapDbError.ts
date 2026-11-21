/**
 * Map Postgres/PostgREST error messages `[R-…]` and constraint names → rule IDs.
 * BE-03; SQL migrations themselves remain BE-01.
 */

const RULE_ID_IN_MESSAGE = /\[(R-(?:VAL|PERM|SYS|CLS|FMT|SRC|MIG)-[A-Z0-9]+)\]/g;

/** Known CHECK / trigger / constraint names → rule IDs (design §3-3 / §3-4). */
export const CONSTRAINT_TO_RULE_ID: Record<string, string> = {
	reports_headline_check: 'R-VAL-R12',
	reports_summary_lines_check: 'R-VAL-R04',
	reports_domain_check: 'R-VAL-R02',
	reports_kind_check: 'R-VAL-R01',
	reports_key_conflict_guard: 'R-VAL-R11',
	reports_alignment_check: 'R-VAL-R15',
	mowa_check_qty: 'R-VAL-M03',
	positions_qty_check: 'R-VAL-M03',
	positions_watch_only_check: 'R-VAL-P13',
	positions_status_check: 'R-VAL-P02',
	position_proposals_calc_note_check: 'R-VAL-P09',
	position_proposals_prepare: 'R-VAL-P07',
	journal_buy_sell_instrument_check: 'R-VAL-J03',
	journal_tickers_check: 'R-VAL-J08',
	journal_kind_check: 'R-VAL-J01',
	instruments_ticker_krx_check: 'R-VAL-C01',
	instruments_ticker_us_check: 'R-VAL-C02',
	instruments_ticker_internal_check: 'R-VAL-C03',
	targets_valuation_guard: 'R-VAL-R13',
	mowa_bot_row_guard: 'R-PERM-01',
	positions_guard: 'R-PERM-02'
};

export type DbErrorLike = {
	message?: string | null;
	code?: string | null;
	details?: string | null;
	hint?: string | null;
	constraint?: string | null;
};

export function extractRuleIdsFromMessage(text: string | null | undefined): string[] {
	if (!text) return [];
	const ids = new Set<string>();
	for (const m of text.matchAll(RULE_ID_IN_MESSAGE)) {
		ids.add(m[1]!);
	}
	return [...ids];
}

export function mapConstraintToRuleId(constraint: string | null | undefined): string | null {
	if (!constraint) return null;
	return CONSTRAINT_TO_RULE_ID[constraint] ?? null;
}

/**
 * Collect rule IDs from a DB/PostgREST error.
 * Prefers explicit `[R-…]` tags in message/details/hint; falls back to constraint map.
 */
export function mapDbErrorToRuleIds(error: DbErrorLike): string[] {
	const ids = new Set<string>();
	for (const field of [error.message, error.details, error.hint]) {
		for (const id of extractRuleIdsFromMessage(field)) ids.add(id);
	}
	const fromConstraint = mapConstraintToRuleId(error.constraint);
	if (fromConstraint) ids.add(fromConstraint);

	// PostgREST often embeds constraint name in message: `violates check constraint "foo"`
	const msg = error.message ?? '';
	const named = msg.match(/constraint "([^"]+)"/i);
	if (named?.[1]) {
		const mapped = mapConstraintToRuleId(named[1]);
		if (mapped) ids.add(mapped);
	}
	return [...ids];
}
