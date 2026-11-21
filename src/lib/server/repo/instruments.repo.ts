import type { InstrumentRow } from '$lib/types/mowa.contract';
import { serverCreateStamps, stripClientIdentity, type RepoClient } from './client';
import { requireOwnerId, withOwnerFilter } from './owner';
import { fromTable } from './supabaseTable';

export type InstrumentCreateInput = Partial<InstrumentRow> &
	Pick<InstrumentRow, 'ticker' | 'name' | 'market' | 'asset_type'>;

export async function listInstruments(
	repo: RepoClient,
	opts: { includeArchived?: boolean } = {}
): Promise<{ data: InstrumentRow[]; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromTable(repo.db, 'instruments').select('*');
	q = withOwnerFilter(q, ownerId);
	if (!opts.includeArchived) q = q.is('archived_at', null);
	const { data, error } = await q;
	return { data: (data ?? []) as InstrumentRow[], error: error as Error | null };
}

export async function createInstrument(
	repo: RepoClient,
	input: InstrumentCreateInput
): Promise<{ data: InstrumentRow | null; error: Error | null }> {
	const stamps = serverCreateStamps(repo.actor);
	const row = {
		...stripClientIdentity(input as Record<string, unknown>),
		...stamps
	};
	const { data, error } = await fromTable(repo.db, 'instruments').insert(row).select('*').single();
	return { data: (data as InstrumentRow | null) ?? null, error: error as Error | null };
}
