/**
 * Map Postgres/PostgREST error messages `[R-…]` / `[DISPLAY-ID]` and constraint
 * names → rule IDs. Constraint names match BE-01 / PR #7 migrations
 * (`supabase/migrations/20261125*`) — do not invent aliases.
 *
 * Unmapped errors never return an empty array: they yield an `UNMAPPED:…` marker
 * that preserves the original SQLSTATE / PostgREST code and constraint name.
 */

/** Marker prefix when no rule tag / constraint map hit. */
export const UNMAPPED_MARKER = 'UNMAPPED';

const TAG_IN_MESSAGE = /\[(R-(?:VAL|PERM|SYS|CLS|FMT|SRC|MIG)-[A-Z0-9]+|DISPLAY-ID)\]/g;

/**
 * Named CHECKs / unique indexes / trigger function names from PR #7.
 * `journal_tickers_check` raises `[R-VAL-C04]` (not J08 — J08 is tags WARN in domain).
 */
export const CONSTRAINT_TO_RULE_ID: Record<string, string> = {
	// instruments
	instruments_krx_code: 'R-VAL-C01',
	instruments_us_ticker: 'R-VAL-C02',
	instruments_internal_code: 'R-VAL-C03',

	// positions
	positions_one_active_per_status: 'R-VAL-P03',
	positions_holding_has_qty: 'R-VAL-P04',
	positions_watch_only_no_trigger: 'R-VAL-P13',
	positions_trigger_direction_check: 'R-VAL-P15',

	// journal
	journal_trade_needs_instrument: 'R-VAL-J03',
	journal_price_needs_currency: 'R-VAL-J05',
	journal_tickers_check: 'R-VAL-C04',
	journal_tickers_max: 'R-VAL-J08',
	journal_entries_owner_id_client_ref_key: 'R-VAL-J06',
	journal_entries_report_fk: 'R-VAL-J04',

	// reports
	reports_kind_check: 'R-VAL-R01',
	reports_subtype_check: 'R-VAL-R01',
	reports_domain_matches_kind: 'R-VAL-R02',
	reports_domain_macro_brief: 'R-VAL-R02',
	reports_domain_stock_analysis: 'R-VAL-R02',
	reports_summary_check: 'R-VAL-R04',
	reports_headline_check: 'R-VAL-R12',
	reports_meta_alignment: 'R-VAL-R15',
	reports_weekly_period: 'R-VAL-T05',
	reports_slug_check: 'R-VAL-S06',
	reports_period_order: 'R-VAL-T05',

	// proposals (PG auto-names column CHECKs as {table}_{column}_check)
	position_proposals_evidence_check: 'R-VAL-P07',
	position_proposals_calc_note_check: 'R-VAL-P09',
	position_proposals_target: 'R-VAL-P07',
	position_proposals_proposer: 'R-PERM-03',
	position_proposals_owner_display_no_key: 'DISPLAY-ID',
	principle_proposals_one_proposer: 'R-PERM-15',
	principle_proposals_owner_display_no_key: 'DISPLAY-ID',
	principle_proposals_evidence_check: 'R-VAL-P07',

	/**
	 * Truncated constraint names as printed in PR #7
	 * `_validate/result.pglite.reference.txt` (fixed-width →).
	 */
	position_proposals_ev: 'R-VAL-P07',
	position_proposals_ca: 'R-VAL-P09',
	positions_watch_only_no_trigge: 'R-VAL-P13',
	positions_trigger_direction_ch: 'R-VAL-P15',
	journal_trade_needs_inst: 'R-VAL-J03',
	journal_price_needs_curr: 'R-VAL-J05',
	principle_proposals_: 'R-VAL-P07',
	re_subscriptions_date_o: 'R-VAL-RE05',

	// bots / realestate / market
	bot_clients_propose_only_fm: 'R-PERM-04',
	bot_clients_principles_propose_only_fm: 'R-PERM-15',
	bot_clients_importer_expires: 'R-PERM-10',
	re_complexes_lat_check: 'R-VAL-M07',
	re_subscriptions_date_order: 'R-VAL-RE05',
	market_indicators_key_fkey: 'R-VAL-I03',
	market_indi: 'R-VAL-I03', // truncated FK name in reference log

	// qty helper (raised as exception text; also used as lookup key)
	mowa_check_qty: 'R-VAL-M03'
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
	for (const m of text.matchAll(TAG_IN_MESSAGE)) {
		ids.add(m[1]!);
	}
	return [...ids];
}

export function extractConstraintName(text: string | null | undefined): string | null {
	if (!text) return null;
	const m = text.match(/constraint "([^"]+)"/i);
	return m?.[1] ?? null;
}

/** Exact or longest-prefix match (reference file truncates long names). */
export function mapConstraintToRuleId(constraint: string | null | undefined): string | null {
	if (!constraint) return null;
	if (CONSTRAINT_TO_RULE_ID[constraint]) return CONSTRAINT_TO_RULE_ID[constraint]!;
	let best: { key: string; rule: string } | null = null;
	for (const [key, rule] of Object.entries(CONSTRAINT_TO_RULE_ID)) {
		if (constraint.startsWith(key) || key.startsWith(constraint)) {
			if (!best || key.length > best.key.length) best = { key, rule };
		}
	}
	return best?.rule ?? null;
}

export function unmappedMarker(error: DbErrorLike, constraintName: string | null): string {
	const code = error.code?.trim() || 'unknown';
	const constraint = constraintName?.trim() || 'none';
	return `${UNMAPPED_MARKER}:${code}:${constraint}`;
}

/**
 * Collect rule IDs from a DB/PostgREST error.
 * Prefers explicit `[R-…]` / `[DISPLAY-ID]` tags; falls back to constraint map.
 * Never returns [] — unmapped → `UNMAPPED:<code>:<constraint>`.
 */
export function mapDbErrorToRuleIds(error: DbErrorLike): string[] {
	const ids = new Set<string>();
	for (const field of [error.message, error.details, error.hint]) {
		for (const id of extractRuleIdsFromMessage(field)) ids.add(id);
	}

	const named =
		error.constraint ??
		extractConstraintName(error.message) ??
		extractConstraintName(error.details);

	const fromConstraint = mapConstraintToRuleId(named);
	if (fromConstraint) ids.add(fromConstraint);

	if (ids.size === 0) {
		return [unmappedMarker(error, named)];
	}
	return [...ids];
}
