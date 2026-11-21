/**
 * Map Postgres/PostgREST error messages `[R-…]` / `[DISPLAY-ID]` and constraint
 * names → rule IDs. Constraint names are the **full** names from BE-01 / PR #7 SQL.
 *
 * `mapConstraintToRuleId` is exact-match only (Object.hasOwn on a null-prototype
 * map) — truncated log fragments and prototype keys (`constructor`, `toString`,
 * `__proto__`) must not map.
 * Unmapped errors never return []: `UNMAPPED:<code>:<constraint>`.
 */

export const UNMAPPED_MARKER = 'UNMAPPED';

const TAG_IN_MESSAGE = /\[(R-(?:VAL|PERM|SYS|CLS|FMT|SRC|MIG)-[A-Z0-9]+|DISPLAY-ID)\]/g;

/**
 * Full constraint / unique-index / trigger-function names → rule IDs.
 * Sources: named `constraint …` in PR #7 migrations, PG auto-names for column
 * CHECKs (`{table}_{column}_check`), unique keys (`{table}_{cols}_key`) when a
 * SQL comment cites a rule ID.
 *
 * Intentionally **unmapped** (leave UNMAPPED unless a clear rule comment exists):
 * - truncated log names (`principle_proposals_`, `market_indi`, …)
 * - `bot_clients_propose_only_fm` — design cites R-PERM-10/15, not R-PERM-04
 * - `principle_proposals_evidence_check` — no clear rule ID in SQL comment
 * - `reports_period_order` — no clear T05 comment (weekly period is `reports_weekly_period`)
 *
 * R-PERM-11 (idempotent client_ref unique keys — not J06):
 * same client_ref + same content → existing row; different content → CONFLICT.
 * J06 is the WARN for same-day/same-title rewrite when there is no client_ref.
 */
const CONSTRAINT_ENTRIES: ReadonlyArray<readonly [string, string]> = [
	// instruments
	['instruments_krx_code', 'R-VAL-C01'],
	['instruments_us_ticker', 'R-VAL-C02'],
	['instruments_internal_code', 'R-VAL-C03'],
	['instruments_asset_type_check', 'R-VAL-I01'],
	['instruments_owner_id_ticker_key', 'R-VAL-I01'],

	// positions — named + auto column CHECKs (SQL comments)
	['positions_one_active_per_status', 'R-VAL-P03'],
	['positions_holding_has_qty', 'R-VAL-P04'],
	['positions_watch_only_no_trigger', 'R-VAL-P13'],
	['positions_status_check', 'R-VAL-P02'],
	['positions_currency_check', 'R-VAL-M01'], // also R-VAL-P05 in SQL comment
	['positions_qty_check', 'R-VAL-M03'],
	['positions_trigger_direction_check', 'R-VAL-P15'],
	['positions_avg_price_check', 'R-VAL-M02'],

	// journal
	['journal_trade_needs_instrument', 'R-VAL-J03'],
	['journal_price_needs_currency', 'R-VAL-J05'],
	['journal_tickers_check', 'R-VAL-C04'],
	['journal_tickers_max', 'R-VAL-J08'],
	['journal_entries_report_fk', 'R-VAL-J04'],
	['journal_entries_kind_check', 'R-VAL-J01'],
	['journal_entries_price_check', 'R-VAL-J05'],
	['journal_entries_title_check', 'R-VAL-S05'],
	['journal_entries_source_url_check', 'R-VAL-S04'],

	// reports — named + auto column CHECKs / unique (SQL comments)
	['reports_kind_check', 'R-VAL-R01'],
	['reports_subtype_check', 'R-VAL-R01'],
	['reports_domain_check', 'R-VAL-R02'],
	['reports_domain_matches_kind', 'R-VAL-R02'],
	['reports_domain_macro_brief', 'R-VAL-R02'],
	['reports_domain_stock_analysis', 'R-VAL-R02'],
	['reports_summary_check', 'R-VAL-R04'],
	['reports_headline_check', 'R-VAL-R12'],
	['reports_meta_alignment', 'R-VAL-R15'],
	['reports_weekly_period', 'R-VAL-T05'],
	['reports_slug_check', 'R-VAL-S06'],
	['reports_title_check', 'R-VAL-S05'],
	['reports_body_md_check', 'R-VAL-S02'],
	['reports_status_check', 'R-VAL-R05'],
	['reports_owner_id_kind_report_date_slug_key', 'R-VAL-R03'],

	// proposals
	['position_proposals_evidence_check', 'R-VAL-P07'],
	['position_proposals_calc_note_check', 'R-VAL-P09'],
	['position_proposals_target', 'R-VAL-P07'],
	['position_proposals_proposer', 'R-PERM-03'],
	['position_proposals_owner_display_no_key', 'DISPLAY-ID'],
	['principle_proposals_one_proposer', 'R-PERM-15'],
	['principle_proposals_owner_display_no_key', 'DISPLAY-ID'],

	// R-PERM-11 client_ref unique keys (exact full names only — not J06)
	['journal_entries_owner_id_client_ref_key', 'R-PERM-11'],
	['decisions_owner_id_client_ref_key', 'R-PERM-11'],
	['events_owner_id_client_ref_key', 'R-PERM-11'],
	['position_proposals_owner_id_client_ref_key', 'R-PERM-11'],
	['principle_proposals_owner_id_client_ref_key', 'R-PERM-11'],

	// market / realestate / helpers
	['targets_valuation_opinion_check', 'R-VAL-I04'],
	['targets_valuation_source_check', 'R-VAL-I04'],
	['bot_clients_principles_propose_only_fm', 'R-PERM-15'],
	['bot_clients_importer_expires', 'R-PERM-10'],
	['re_complexes_lat_check', 'R-VAL-M07'],
	['re_complexes_households_check', 'R-VAL-M06'],
	['re_complexes_total_score_check', 'R-VAL-M08'],
	['re_market_stats_source_check', 'R-VAL-RE04'],
	['re_subscriptions_date_order', 'R-VAL-RE05'],
	['market_indicators_key_fkey', 'R-VAL-I03'],
	['mowa_check_qty', 'R-VAL-M03']
];

/** Null-prototype map so Object.prototype keys never resolve. */
export const CONSTRAINT_TO_RULE_ID: Record<string, string> = Object.create(null);
for (const [name, ruleId] of CONSTRAINT_ENTRIES) {
	CONSTRAINT_TO_RULE_ID[name] = ruleId;
}

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

/** Exact match only against the full-name table (Object.hasOwn). */
export function mapConstraintToRuleId(constraint: string | null | undefined): string | null {
	if (!constraint) return null;
	if (!Object.hasOwn(CONSTRAINT_TO_RULE_ID, constraint)) return null;
	return CONSTRAINT_TO_RULE_ID[constraint] ?? null;
}

export function unmappedMarker(error: DbErrorLike, constraintName: string | null): string {
	const code = error.code?.trim() || 'unknown';
	const constraint = constraintName?.trim() || 'none';
	return `${UNMAPPED_MARKER}:${code}:${constraint}`;
}

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
