import type { PositionRow } from '$lib/types/mowa.contract';
import { serverCreateStamps, stripClientIdentity, type RepoClient } from './client';
import { requireOwnerId, withOwnerFilter } from './owner';
import { fromTable } from './supabaseTable';

export type PositionCreateInput = Partial<PositionRow> &
	Pick<PositionRow, 'instrument_id' | 'status' | 'currency'>;

export async function listPositions(
	repo: RepoClient,
	opts: { includeArchived?: boolean } = {}
): Promise<{ data: PositionRow[]; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromTable(repo.db, 'positions').select('*');
	q = withOwnerFilter(q, ownerId);
	if (!opts.includeArchived) q = q.is('archived_at', null);
	const { data, error } = await q;
	return { data: (data ?? []) as PositionRow[], error: error as Error | null };
}

export async function createPosition(
	repo: RepoClient,
	input: PositionCreateInput
): Promise<{ data: PositionRow | null; error: Error | null }> {
	const stamps = serverCreateStamps(repo.actor);
	const row = {
		...stripClientIdentity(input as Record<string, unknown>),
		...stamps
	};
	const { data, error } = await fromTable(repo.db, 'positions').insert(row).select('*').single();
	return { data: (data as PositionRow | null) ?? null, error: error as Error | null };
}

export async function updatePosition(
	repo: RepoClient,
	id: string,
	patch: Partial<PositionRow>
): Promise<{ data: PositionRow | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	const safe = stripClientIdentity(patch as Record<string, unknown>);
	let q = fromTable(repo.db, 'positions').update(safe).eq('id', id);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.select('*').single();
	return { data: (data as PositionRow | null) ?? null, error: error as Error | null };
}
