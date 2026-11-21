/**
 * M-3: archive / restore are dedicated paths — never via generic patch.
 * Restore is user-only at the DB/RLS layer (R-SYS-03); repo still scopes by owner_id.
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

export async function archiveRow(
	repo: RepoClient,
	table: ArchivableTable,
	id: string
): Promise<{ error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromTable(getRepoDb(repo), table)
		.update({ archived_at: new Date().toISOString() })
		.eq('id', id);
	q = withOwnerFilter(q, ownerId);
	const { error } = await q;
	return { error: error as Error | null };
}

export async function restoreRow(
	repo: RepoClient,
	table: ArchivableTable,
	id: string
): Promise<{ error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromTable(getRepoDb(repo), table).update({ archived_at: null }).eq('id', id);
	q = withOwnerFilter(q, ownerId);
	const { error } = await q;
	return { error: error as Error | null };
}
