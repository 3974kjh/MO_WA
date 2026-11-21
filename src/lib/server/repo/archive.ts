/**
 * M-3 / Low: archive / restore are dedicated paths — never via generic patch.
 * Restore requires a user actor (service-role bypasses RLS — do not rely on triggers alone).
 * Missing id or other-owner rows must not report success.
 */
import type { RepoClient } from './client';
import { getRepoDb } from './client';
import { requireOwnerId, withOwnerFilter } from './owner';
import { fromTable } from './supabaseTable';

export type ArchivableTable =
	| 'reports'
	| 'positions'
	| 'journal_entries'
	| 'instruments'
	| 'decisions'
	| 'events'
	| 're_complexes'
	| 're_subscriptions';

async function updateArchivedAt(
	repo: RepoClient,
	table: ArchivableTable,
	id: string,
	archivedAt: string | null
): Promise<{ error: Error | null }> {
	if (!id) {
		return { error: new Error('[R-SYS-01] id is required for archive/restore') };
	}
	const ownerId = requireOwnerId(repo);
	let q = fromTable(getRepoDb(repo), table)
		.update({ archived_at: archivedAt })
		.eq('id', id);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.select('id').maybeSingle();
	if (error) return { error: error as Error };
	if (!data) {
		return {
			error: new Error('[R-SYS-01] row not found for owner (missing id or owner mismatch)')
		};
	}
	return { error: null };
}

export async function archiveRow(
	repo: RepoClient,
	table: ArchivableTable,
	id: string
): Promise<{ error: Error | null }> {
	return updateArchivedAt(repo, table, id, new Date().toISOString());
}

export async function restoreRow(
	repo: RepoClient,
	table: ArchivableTable,
	id: string
): Promise<{ error: Error | null }> {
	if (repo.actor.kind !== 'user') {
		return {
			error: new Error('[R-SYS-03] restore requires a user actor (bots cannot restore)')
		};
	}
	return updateArchivedAt(repo, table, id, null);
}
