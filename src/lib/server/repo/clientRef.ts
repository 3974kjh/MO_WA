/**
 * R-PERM-11 client_ref idempotency (exact unique-key names only).
 *
 * Same client_ref + same content → return the existing row.
 * Same client_ref + different content → CONFLICT (do not map to J06).
 * J06 is the WARN for same-day/same-title rewrite when there is no client_ref.
 */
import { mapDbErrorToRuleIds } from '$lib/server/domain/validation/mapDbError';
import type { RepoClient } from './client';
import { fromRepo } from './db';
import { requireOwnerId, withOwnerFilter } from './owner';

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

function isClientRefUniqueViolation(error: { message?: string | null; code?: string | null }): boolean {
	const ids = mapDbErrorToRuleIds(error);
	return ids.includes('R-PERM-11');
}

function stablePayload(row: Record<string, unknown>, ignore: readonly string[]): string {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(row)) {
		if (ignore.includes(k)) continue;
		out[k] = v;
	}
	return JSON.stringify(out, Object.keys(out).sort());
}

const COMPARE_IGNORE = [
	'id',
	'created_at',
	'updated_at',
	'archived_at',
	'version',
	'approval_version',
	'display_no',
	'display_id',
	'source_bot_id',
	'owner_id'
] as const;

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
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, table).select('*').eq('client_ref', clientRef);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.maybeSingle();
	if (error) return { data: null, error: error as Error };
	if (!data) {
		return {
			data: null,
			error: new Error('[R-PERM-11] CONFLICT: client_ref unique violation without existing row')
		};
	}
	const existing = data as Record<string, unknown>;
	if (stablePayload(existing, COMPARE_IGNORE) === stablePayload(attempted, COMPARE_IGNORE)) {
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
