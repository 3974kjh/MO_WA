import type { PositionProposalRow, PrincipleProposalRow } from '$lib/types/mowa.contract';
import { stripClientIdentity, type RepoClient } from './client';
import {
	clientRefConflictFromInsertError,
	resolveClientRefConflict
} from './clientRef';
import { fromRepo } from './db';
import { isOwnerDisplayId } from './displayId';
import { requireOwnerId, withOwnerFilter } from './owner';

export type PositionProposalCreateInput = Partial<PositionProposalRow> &
	Pick<PositionProposalRow, 'change_type'> & { client_ref?: string | null };

/**
 * List position proposals for owner.
 * `display_id` is the server string (P-0412) — never recompute from uuid.
 */
export async function listPositionProposals(
	repo: RepoClient
): Promise<{ data: PositionProposalRow[]; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'position_proposals').select('*');
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	return { data: (data ?? []) as PositionProposalRow[], error: error as Error | null };
}

/**
 * Insert proposal — display_no/display_id and proposed_by* assigned by DB triggers.
 * M-2: never pass proposed_by* / source_bot_id; table has no source_bot_id column.
 * R-PERM-11: same client_ref + same content → existing; different → CONFLICT.
 */
export async function createPositionProposal(
	repo: RepoClient,
	input: PositionProposalCreateInput
): Promise<{ data: PositionProposalRow | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	const row: Record<string, unknown> = {
		...stripClientIdentity(input as Record<string, unknown>),
		owner_id: ownerId
	};
	const { data, error } = await fromRepo(repo, 'position_proposals')
		.insert(row)
		.select('*')
		.single();
	if (!error) {
		return { data: (data as PositionProposalRow | null) ?? null, error: null };
	}
	const clientRef = typeof row.client_ref === 'string' ? row.client_ref : null;
	if (clientRef && clientRefConflictFromInsertError(error)) {
		return resolveClientRefConflict<PositionProposalRow>(
			repo,
			'position_proposals',
			clientRef,
			row
		);
	}
	return { data: null, error: error as Error };
}

export async function listPrincipleProposals(
	repo: RepoClient
): Promise<{ data: PrincipleProposalRow[]; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'principle_proposals').select('*');
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
	let q = fromRepo(repo, 'position_proposals').select('*').eq('display_id', displayId);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.maybeSingle();
	return { data: (data as PositionProposalRow | null) ?? null, error: error as Error | null };
}
