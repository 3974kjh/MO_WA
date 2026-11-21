import type { JournalEntryRow } from '$lib/types/mowa.contract';
import { archiveRow, restoreRow } from './archive';
import { getRepoDb, serverCreateStamps, stripClientIdentity, type RepoClient } from './client';
import { requireOwnerId, withOwnerFilter } from './owner';
import { JOURNAL_PATCHABLE, pickPatchable } from './patch';
import { fromTable } from './supabaseTable';

export type JournalCreateInput = Partial<JournalEntryRow> &
	Pick<JournalEntryRow, 'entry_date' | 'kind' | 'state' | 'title'>;

export async function listJournalEntries(
	repo: RepoClient,
	opts: { includeArchived?: boolean } = {}
): Promise<{ data: JournalEntryRow[]; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromTable(getRepoDb(repo), 'journal_entries').select('*');
	q = withOwnerFilter(q, ownerId);
	if (!opts.includeArchived) q = q.is('archived_at', null);
	const { data, error } = await q;
	return { data: (data ?? []) as JournalEntryRow[], error: error as Error | null };
}

/** Create — no runRules (M-5). Callers must hold rows that fail J03/J05 CHECKs (L5). */
export async function createJournalEntry(
	repo: RepoClient,
	input: JournalCreateInput
): Promise<{ data: JournalEntryRow | null; error: Error | null }> {
	const stamps = serverCreateStamps(repo.actor);
	const row = {
		...stripClientIdentity(input as Record<string, unknown>),
		...stamps
	};
	const { data, error } = await fromTable(getRepoDb(repo), 'journal_entries')
		.insert(row)
		.select('*')
		.single();
	return { data: (data as JournalEntryRow | null) ?? null, error: error as Error | null };
}

export async function updateJournalEntry(
	repo: RepoClient,
	id: string,
	patch: Partial<JournalEntryRow>
): Promise<{ data: JournalEntryRow | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	const safe = pickPatchable(patch as Record<string, unknown>, JOURNAL_PATCHABLE);
	let q = fromTable(getRepoDb(repo), 'journal_entries').update(safe).eq('id', id);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.select('*').single();
	return { data: (data as JournalEntryRow | null) ?? null, error: error as Error | null };
}

export function archiveJournalEntry(repo: RepoClient, id: string) {
	return archiveRow(repo, 'journal_entries', id);
}

export function restoreJournalEntry(repo: RepoClient, id: string) {
	return restoreRow(repo, 'journal_entries', id);
}
