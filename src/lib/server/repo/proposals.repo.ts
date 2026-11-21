import type { PositionProposalRow, PrincipleProposalRow } from '$lib/types/mowa.contract';
import { isOwnerDisplayId } from './displayId';
import { serverCreateStamps, stripClientIdentity, type RepoClient } from './client';
import { requireOwnerId, withOwnerFilter } from './owner';
import { fromTable } from './supabaseTable';

export type PositionProposalCreateInput = Partial<PositionProposalRow> &
	Pick<PositionProposalRow, 'change_type'>;

/**
 * List position proposals for owner.
 * `display_id` is the server string (P-0412) — never recompute from uuid.
 */
export async function listPositionProposals(
	repo: RepoClient
): Promise<{ data: PositionProposalRow[]; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromTable(repo.db, 'position_proposals').select('*');
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	const rows = ((data ?? []) as PositionProposalRow[]).map((row) => {
		if (row.display_id && !isOwnerDisplayId(row.display_id)) {
			// Defensive: still return the server value; callers must not invent IDs.
		}
		return row;
	});
	return { data: rows, error: error as Error | null };
}

/** Insert proposal — display_no/display_id assigned by DB trigger; client values stripped. */
export async function createPositionProposal(
	repo: RepoClient,
	input: PositionProposalCreateInput
): Promise<{ data: PositionProposalRow | null; error: Error | null }> {
	const stamps = serverCreateStamps(repo.actor);
	const row = {
		...stripClientIdentity(input as Record<string, unknown>),
		...stamps,
		proposed_by_type: repo.actor.kind === 'bot' ? 'bot' : 'user',
		proposed_by: repo.actor.botClientId
	};
	const { data, error } = await fromTable(repo.db, 'position_proposals')
		.insert(row)
		.select('*')
		.single();
	return { data: (data as PositionProposalRow | null) ?? null, error: error as Error | null };
}

export async function listPrincipleProposals(
	repo: RepoClient
): Promise<{ data: PrincipleProposalRow[]; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromTable(repo.db, 'principle_proposals').select('*');
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	return { data: (data ?? []) as PrincipleProposalRow[], error: error as Error | null };
}

/** Look up by server display_id string within owner scope. */
export async function getPositionProposalByDisplayId(
	repo: RepoClient,
	displayId: string
): Promise<{ data: PositionProposalRow | null; error: Error | null }> {
	if (!isOwnerDisplayId(displayId) || !displayId.startsWith('P-')) {
		return { data: null, error: new Error('display_id must be a server P-… string') };
	}
	const ownerId = requireOwnerId(repo);
	let q = fromTable(repo.db, 'position_proposals').select('*').eq('display_id', displayId);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.maybeSingle();
	return { data: (data as PositionProposalRow | null) ?? null, error: error as Error | null };
}
