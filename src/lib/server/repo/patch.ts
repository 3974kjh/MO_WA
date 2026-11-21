/**
 * M-3: only table-specific patchable fields. System columns never pass through a patch.
 * Archive / restore go through dedicated helpers (not generic update).
 *
 * Do NOT run the proposal-scoped strip here — positions/reports `status` must
 * remain patchable via the allowlist.
 */

export const SYSTEM_PATCH_BLOCKLIST = [
	'id',
	'owner_id',
	'source_bot_id',
	'version',
	'approval_version',
	'archived_at',
	'created_at',
	'updated_at',
	'display_no',
	'display_id'
] as const;

export const REPORT_PATCHABLE = [
	'kind',
	'subtype',
	'domain',
	'slug',
	'title',
	'headline',
	'report_date',
	'period_start',
	'period_end',
	'summary',
	'body_md',
	'tags',
	'tickers',
	'meta',
	'status',
	'generated_at'
	// body_blocks / toc: NOT patchable — only mowa_set_report_render_cache + GUC (BE-07 / FE-04)
] as const;

export const POSITION_PATCHABLE = [
	'instrument_id',
	'status',
	'currency',
	'qty',
	'avg_price',
	'breakeven',
	'base_price',
	'base_at',
	'trigger_price',
	'trigger_direction',
	'memo',
	'watch_only',
	'source_ref'
] as const;

export const JOURNAL_PATCHABLE = [
	'entry_date',
	'kind',
	'state',
	'instrument_id',
	'tickers',
	'title',
	'price',
	'qty',
	'avg_price',
	'breakeven',
	'currency',
	'source_url',
	'memo_md',
	'report_id',
	'client_ref'
] as const;

export const INSTRUMENT_PATCHABLE = [
	'name',
	'market',
	'asset_type',
	'sector',
	'aliases',
	'is_watchlist'
] as const;

export const DECISION_PATCHABLE = [
	'title',
	'context_md',
	'options',
	'status',
	'due_date',
	'decided_at',
	'decision_md',
	'instrument_id',
	'report_id',
	'client_ref'
] as const;

export const EVENT_PATCHABLE = [
	'event_date',
	'event_time',
	'is_estimated',
	'title',
	'domain',
	'kind',
	'status',
	'link',
	'instrument_id',
	'amount',
	'currency',
	'client_ref',
	'meta'
] as const;

const DANGEROUS_OWN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function assignOwn(out: Record<string, unknown>, key: string, value: unknown): void {
	Object.defineProperty(out, key, {
		value,
		enumerable: true,
		writable: true,
		configurable: true
	});
}

/**
 * Keep only allowlisted fields; drop system blocklist + proposed_by*.
 * Does not strip domain `status` on positions/reports.
 * Result is a null-prototype object; dangerous own-keys are dropped.
 */
export function pickPatchable(
	patch: Record<string, unknown>,
	allow: readonly string[]
): Record<string, unknown> {
	const out: Record<string, unknown> = Object.create(null);
	const allowSet = new Set(allow);
	for (const [key, value] of Object.entries(patch)) {
		if (DANGEROUS_OWN_KEYS.has(key)) continue;
		if (key.startsWith('proposed_by')) continue;
		if ((SYSTEM_PATCH_BLOCKLIST as readonly string[]).includes(key)) continue;
		if (!allowSet.has(key)) continue;
		assignOwn(out, key, value);
	}
	return out;
}
