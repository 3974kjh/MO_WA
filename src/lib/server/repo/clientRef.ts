/**
 * R-PERM-11 client_ref idempotency (exact unique-key names only).
 *
 * Same client_ref + same content → return the existing row.
 * Same client_ref + different content → CONFLICT (do not map to J06).
 * J06 is the WARN for same-day/same-title rewrite when there is no client_ref.
 *
 * Comparison uses attempted (input) keys only, excluding server-filled columns
 * and keys whose attempted value is `undefined` (incl. nested). Nested values
 * use recursively key-sorted canonical JSON — never a stringify replacer array.
 */
import { mapDbErrorToRuleIds } from '$lib/server/domain/validation/mapDbError';
import { serverFilledKeysForTable, type RepoClient, type StripTable } from './client';
import { fromRepo } from './db';
import { requireOwnerId } from './owner';

export const CLIENT_REF_UNIQUE_KEYS = [
	'journal_entries_owner_id_client_ref_key',
	'decisions_owner_id_client_ref_key',
	'events_owner_id_client_ref_key',
	'position_proposals_owner_id_client_ref_key',
	'principle_proposals_owner_id_client_ref_key'
] as const;

export type ClientRefTable =
	| 'journal_entries'
	| 'decisions'
	| 'events'
	| 'position_proposals'
	| 'principle_proposals';

function isServerFilledKey(key: string, table: StripTable): boolean {
	if (serverFilledKeysForTable(table).includes(key)) return true;
	if (key.startsWith('proposed_by')) return true;
	return false;
}

/** Drop keys whose value is `undefined` (recursively). */
export function dropUndefinedKeys(value: unknown): unknown {
	if (value === undefined) return undefined;
	if (value === null || typeof value !== 'object') return value;
	if (value instanceof Date) return value;
	if (Array.isArray(value)) {
		return value.map((item) => dropUndefinedKeys(item));
	}
	const out: Record<string, unknown> = Object.create(null);
	for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
		if (nested === undefined) continue;
		const cleaned = dropUndefinedKeys(nested);
		if (cleaned === undefined) continue;
		out[key] = cleaned;
	}
	return out;
}

/**
 * Recursively sort object keys for stable JSON — no replacer array.
 * Uses null-prototype objects so `__proto__` keys are preserved in the output.
 * Dates become ISO strings (not `{}`).
 */
export function canonicalize(value: unknown): unknown {
	if (value instanceof Date) return value.toISOString();
	if (value === null || typeof value !== 'object') return value;
	if (Array.isArray(value)) return value.map(canonicalize);
	const obj = value as Record<string, unknown>;
	const sorted: Record<string, unknown> = Object.create(null);
	for (const key of Object.keys(obj).sort()) {
		sorted[key] = canonicalize(obj[key]);
	}
	return sorted;
}

export function canonicalJson(value: unknown): string {
	return JSON.stringify(canonicalize(value));
}

/**
 * Pick attempted keys (minus server-filled / undefined) from both sides and compare.
 * Nested-only differences (e.g. proposed_values.qty) must yield inequality.
 * `{ memo: undefined }` vs DB `memo: null` must not CONFLICT on identical retry.
 */
export function clientRefContentMatches(
	attempted: Record<string, unknown>,
	existing: Record<string, unknown>,
	table: ClientRefTable
): boolean {
	const cleaned = dropUndefinedKeys(attempted) as Record<string, unknown>;
	const keys = Object.keys(cleaned).filter((k) => !isServerFilledKey(k, table));
	const slice = (row: Record<string, unknown>): Record<string, unknown> => {
		const out: Record<string, unknown> = Object.create(null);
		for (const key of keys) {
			out[key] = key in row ? row[key] : null;
		}
		return out;
	};
	return canonicalJson(slice(cleaned)) === canonicalJson(slice(existing));
}

function isClientRefUniqueViolation(error: {
	message?: string | null;
	code?: string | null;
	details?: string | null;
}): boolean {
	const ids = mapDbErrorToRuleIds(error);
	return ids.includes('R-PERM-11');
}

/**
 * After a unique violation on owner_id+client_ref, resolve idempotently.
 * Returns existing row when content matches; otherwise a CONFLICT error.
 */
export async function resolveClientRefConflict<T extends Record<string, unknown>>(
	repo: RepoClient,
	table: ClientRefTable,
	clientRef: string,
	attempted: Record<string, unknown>
): Promise<{ data: T | null; error: Error | null }> {
	requireOwnerId(repo);
	const { data, error } = await fromRepo(repo, table)
		.select('*')
		.eq('client_ref', clientRef)
		.maybeSingle();
	if (error) return { data: null, error: error as Error };
	if (!data) {
		return {
			data: null,
			error: new Error('[R-PERM-11] CONFLICT: client_ref unique violation without existing row')
		};
	}
	const existing = data as Record<string, unknown>;
	if (clientRefContentMatches(attempted, existing, table)) {
		return { data: existing as T, error: null };
	}
	return {
		data: null,
		error: new Error(
			`[R-PERM-11] CONFLICT: client_ref "${clientRef}" exists with different content`
		)
	};
}

export function clientRefConflictFromInsertError(
	error: { message?: string | null; code?: string | null; details?: string | null } | null
): boolean {
	if (!error) return false;
	return isClientRefUniqueViolation(error);
}
