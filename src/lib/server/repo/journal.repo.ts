import type { JournalEntryRow } from '$lib/types/mowa.contract';
import { archiveRow, restoreRow } from './archive';
import { serverCreateStamps, stripClientIdentity, type RepoClient } from './client';
import {
	clientRefConflictFromInsertError,
	resolveClientRefConflict
} from './clientRef';
import { fromRepo } from './db';
import { requireOwnerId, withOwnerFilter } from './owner';
import { JOURNAL_PATCHABLE, pickPatchable } from './patch';

export type JournalCreateInput = Partial<JournalEntryRow> &
	Pick<JournalEntryRow, 'entry_date' | 'kind' | 'state' | 'title'>;

export async function listJournalEntries(
	repo: RepoClient,
	opts: { includeArchived?: boolean } = {}
): Promise<{ data: JournalEntryRow[]; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'journal_entries').select('*');
	q = withOwnerFilter(q, ownerId);
	if (!opts.includeArchived) q = q.is('archived_at', null);
	const { data, error } = await q;
	return { data: (data ?? []) as JournalEntryRow[], error: error as Error | null };
}

/**
 * Create — no runRules (M-5). Callers must hold rows that fail J03/J05 CHECKs (L5).
 * R-PERM-11: same client_ref + same content → existing row; different content → CONFLICT.
 */
export async function createJournalEntry(
	repo: RepoClient,
	input: JournalCreateInput
): Promise<{ data: JournalEntryRow | null; error: Error | null }> {
	const stamps = serverCreateStamps(repo.actor);
	const row: Record<string, unknown> = {
		...stripClientIdentity(input as Record<string, unknown>, 'journal_entries'),
		...stamps
	};
	const { data, error } = await fromRepo(repo, 'journal_entries').insert(row).select('*').single();
	if (!error) {
		return { data: (data as JournalEntryRow | null) ?? null, error: null };
	}
	const clientRef = typeof row.client_ref === 'string' ? row.client_ref : null;
	if (clientRef && clientRefConflictFromInsertError(error)) {
		return resolveClientRefConflict<JournalEntryRow>(repo, 'journal_entries', clientRef, row);
	}
	return { data: null, error: error as Error };
}

export async function updateJournalEntry(
	repo: RepoClient,
	id: string,
	patch: Partial<JournalEntryRow>
): Promise<{ data: JournalEntryRow | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	const safe = pickPatchable(patch as Record<string, unknown>, JOURNAL_PATCHABLE);
	let q = fromRepo(repo, 'journal_entries').update(safe).eq('id', id);
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
