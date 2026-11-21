import type { InstrumentRow } from '$lib/types/mowa.contract';
import { archiveRow, restoreRow } from './archive';
import { serverCreateStamps, stripClientIdentity, type RepoClient } from './client';
import { fromRepo } from './db';
import { requireOwnerId, withOwnerFilter } from './owner';
import { INSTRUMENT_PATCHABLE, pickPatchable } from './patch';

export type InstrumentCreateInput = Partial<InstrumentRow> &
	Pick<InstrumentRow, 'ticker' | 'name' | 'market' | 'asset_type'>;

export async function listInstruments(
	repo: RepoClient,
	opts: { includeArchived?: boolean } = {}
): Promise<{ data: InstrumentRow[]; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'instruments').select('*');
	q = withOwnerFilter(q, ownerId);
	if (!opts.includeArchived) q = q.is('archived_at', null);
	const { data, error } = await q;
	return { data: (data ?? []) as InstrumentRow[], error: error as Error | null };
}

/** Owner-scoped lookup by ticker (includes archived rows — unique key spans them). */
export async function getInstrumentByTicker(
	repo: RepoClient,
	ticker: string
): Promise<{ data: InstrumentRow | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'instruments').select('*').eq('ticker', ticker);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.maybeSingle();
	return { data: (data as InstrumentRow | null) ?? null, error: error as Error | null };
}

export async function createInstrument(
	repo: RepoClient,
	input: InstrumentCreateInput
): Promise<{ data: InstrumentRow | null; error: Error | null }> {
	const stamps = serverCreateStamps(repo.actor);
	const row = {
		...stripClientIdentity(input as Record<string, unknown>, 'instruments'),
		...stamps
	};
	const { data, error } = await fromRepo(repo, 'instruments').insert(row).select('*').single();
	return { data: (data as InstrumentRow | null) ?? null, error: error as Error | null };
}

export async function updateInstrument(
	repo: RepoClient,
	id: string,
	patch: Partial<InstrumentRow>
): Promise<{ data: InstrumentRow | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	const safe = pickPatchable(patch as Record<string, unknown>, INSTRUMENT_PATCHABLE);
	let q = fromRepo(repo, 'instruments').update(safe).eq('id', id);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.select('*').single();
	return { data: (data as InstrumentRow | null) ?? null, error: error as Error | null };
}

export function archiveInstrument(repo: RepoClient, id: string) {
	return archiveRow(repo, 'instruments', id);
}

export function restoreInstrument(repo: RepoClient, id: string) {
	return restoreRow(repo, 'instruments', id);
}
