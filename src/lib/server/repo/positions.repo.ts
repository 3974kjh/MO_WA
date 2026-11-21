import type { PositionRow } from '$lib/types/mowa.contract';
import { archiveRow, restoreRow } from './archive';
import { serverCreateStamps, stripClientIdentity, type RepoClient } from './client';
import { fromRepo } from './db';
import { requireOwnerId, withOwnerFilter } from './owner';
import { pickPatchable, POSITION_PATCHABLE } from './patch';

export type PositionCreateInput = Partial<PositionRow> &
	Pick<PositionRow, 'instrument_id' | 'status' | 'currency'>;

export async function listPositions(
	repo: RepoClient,
	opts: { includeArchived?: boolean } = {}
): Promise<{ data: PositionRow[]; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'positions').select('*');
	q = withOwnerFilter(q, ownerId);
	if (!opts.includeArchived) q = q.is('archived_at', null);
	const { data, error } = await q;
	return { data: (data ?? []) as PositionRow[], error: error as Error | null };
}

/** Create — no runRules (M-5). */
export async function createPosition(
	repo: RepoClient,
	input: PositionCreateInput
): Promise<{ data: PositionRow | null; error: Error | null }> {
	const stamps = serverCreateStamps(repo.actor);
	const row = {
		...stripClientIdentity(input as Record<string, unknown>),
		...stamps
	};
	const { data, error } = await fromRepo(repo, 'positions').insert(row).select('*').single();
	return { data: (data as PositionRow | null) ?? null, error: error as Error | null };
}

export async function updatePosition(
	repo: RepoClient,
	id: string,
	patch: Partial<PositionRow>
): Promise<{ data: PositionRow | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	const safe = pickPatchable(patch as Record<string, unknown>, POSITION_PATCHABLE);
	let q = fromRepo(repo, 'positions').update(safe).eq('id', id);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.select('*').single();
	return { data: (data as PositionRow | null) ?? null, error: error as Error | null };
}

export function archivePosition(repo: RepoClient, id: string) {
	return archiveRow(repo, 'positions', id);
}

export function restorePosition(repo: RepoClient, id: string) {
	return restoreRow(repo, 'positions', id);
}
