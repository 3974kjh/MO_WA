import type { PositionProposalRow, PrincipleProposalRow } from '$lib/types/mowa.contract';
import { stripClientIdentity, type RepoClient } from './client';
import { clientRefConflictFromInsertError, resolveClientRefConflict } from './clientRef';
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
		...stripClientIdentity(input as Record<string, unknown>, 'position_proposals'),
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

export type PrincipleProposalCreateInput = {
	principle_id: string;
	proposed_body_md: string;
	reason_md: string;
	evidence: unknown;
	clause_ref?: string | null;
	client_ref?: string | null;
};

/**
 * List principle proposals for owner.
 * `display_id` is the server string (R-0001) — never recompute from uuid.
 */
export async function listPrincipleProposals(
	repo: RepoClient
): Promise<{ data: PrincipleProposalRow[]; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'principle_proposals').select('*');
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	return { data: (data ?? []) as PrincipleProposalRow[], error: error as Error | null };
}

/**
 * Insert principle proposal — display_no/display_id, base_version/hash, proposed_by*
 * assigned by DB triggers. M-2: never pass proposed_by* (client values ignored/stripped).
 */
export async function createPrincipleProposal(
	repo: RepoClient,
	input: PrincipleProposalCreateInput
): Promise<{ data: PrincipleProposalRow | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	const row: Record<string, unknown> = {
		...stripClientIdentity(input as Record<string, unknown>, 'principle_proposals'),
		owner_id: ownerId,
		principle_id: input.principle_id,
		proposed_body_md: input.proposed_body_md,
		reason_md: input.reason_md,
		evidence: input.evidence
	};
	if (input.clause_ref != null) row.clause_ref = input.clause_ref;
	if (input.client_ref != null) row.client_ref = input.client_ref;

	const { data, error } = await fromRepo(repo, 'principle_proposals')
		.insert(row)
		.select('*')
		.single();
	if (!error) {
		return { data: (data as PrincipleProposalRow | null) ?? null, error: null };
	}
	const clientRef = typeof row.client_ref === 'string' ? row.client_ref : null;
	if (clientRef && clientRefConflictFromInsertError(error)) {
		return resolveClientRefConflict<PrincipleProposalRow>(
			repo,
			'principle_proposals',
			clientRef,
			row
		);
	}
	return { data: null, error: error as Error };
}

export async function getPrincipleProposalByDisplayId(
	repo: RepoClient,
	displayId: string
): Promise<{ data: PrincipleProposalRow | null; error: Error | null }> {
	if (!isOwnerDisplayId(displayId) || !displayId.startsWith('R-')) {
		return { data: null, error: new Error('display_id must be a server R-… string') };
	}
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'principle_proposals').select('*').eq('display_id', displayId);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.maybeSingle();
	return { data: (data as PrincipleProposalRow | null) ?? null, error: error as Error | null };
}

export async function getPrincipleProposalById(
	repo: RepoClient,
	id: string
): Promise<{ data: PrincipleProposalRow | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'principle_proposals').select('*').eq('id', id);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.maybeSingle();
	return { data: (data as PrincipleProposalRow | null) ?? null, error: error as Error | null };
}

/**
 * Compare-and-set status transition for principle proposals
 * (e.g. cancel: pending/on_hold → cancelled). Bot cancel is further gated by DB trigger.
 */
export async function updatePrincipleProposalStatus(
	repo: RepoClient,
	id: string,
	transition: { from: readonly string[]; to: string }
): Promise<{ data: PrincipleProposalRow | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'principle_proposals')
		.update({ status: transition.to })
		.eq('id', id)
		.in('status', [...transition.from]);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.select('*').maybeSingle();
	return { data: (data as PrincipleProposalRow | null) ?? null, error: error as Error | null };
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

export async function getPositionProposalById(
	repo: RepoClient,
	id: string
): Promise<{ data: PositionProposalRow | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'position_proposals').select('*').eq('id', id);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.maybeSingle();
	return { data: (data as PositionProposalRow | null) ?? null, error: error as Error | null };
}

/**
 * Compare-and-set status transition (e.g. cancel: pending/on_hold → cancelled).
 * Returns data=null when no row matched (wrong id/owner or status not in `from`).
 */
export async function updateProposalStatus(
	repo: RepoClient,
	id: string,
	transition: { from: readonly string[]; to: string }
): Promise<{ data: PositionProposalRow | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'position_proposals')
		.update({ status: transition.to })
		.eq('id', id)
		.in('status', [...transition.from]);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.select('*').maybeSingle();
	return { data: (data as PositionProposalRow | null) ?? null, error: error as Error | null };
}
