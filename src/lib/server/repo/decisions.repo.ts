import type { Database } from '$lib/types/database.types';
import { archiveRow, restoreRow } from './archive';
import { serverCreateStamps, stripClientIdentity, type RepoClient } from './client';
import { clientRefConflictFromInsertError, resolveClientRefConflict } from './clientRef';
import { fromRepo } from './db';
import { requireOwnerId, withOwnerFilter } from './owner';
import { DECISION_PATCHABLE, pickPatchable } from './patch';

export type DecisionRow = Database['public']['Tables']['decisions']['Row'];
export type DecisionCreateInput = Partial<DecisionRow> & Pick<DecisionRow, 'title'>;

export async function listDecisions(
	repo: RepoClient,
	opts: { status?: string; includeArchived?: boolean; limit?: number } = {}
): Promise<{ data: DecisionRow[]; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'decisions').select('*');
	q = withOwnerFilter(q, ownerId);
	if (!opts.includeArchived) q = q.is('archived_at', null);
	if (opts.status) q = q.eq('status', opts.status);
	q = q.order('due_date', { ascending: true, nullsFirst: false });
	if (opts.limit) q = q.limit(opts.limit);
	const { data, error } = await q;
	return { data: (data ?? []) as DecisionRow[], error: error as Error | null };
}

export async function getDecisionById(
	repo: RepoClient,
	id: string
): Promise<{ data: DecisionRow | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'decisions').select('*').eq('id', id);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.maybeSingle();
	return { data: (data as DecisionRow | null) ?? null, error: error as Error | null };
}

/** R-PERM-11: same client_ref + same content → existing row; different content → CONFLICT. */
export async function createDecision(
	repo: RepoClient,
	input: DecisionCreateInput
): Promise<{ data: DecisionRow | null; error: Error | null }> {
	const stamps = serverCreateStamps(repo.actor);
	const row: Record<string, unknown> = {
		...stripClientIdentity(input as Record<string, unknown>, 'decisions'),
		...stamps
	};
	const { data, error } = await fromRepo(repo, 'decisions').insert(row).select('*').single();
	if (!error) return { data: (data as DecisionRow | null) ?? null, error: null };
	const clientRef = typeof row.client_ref === 'string' ? row.client_ref : null;
	if (clientRef && clientRefConflictFromInsertError(error)) {
		return resolveClientRefConflict<DecisionRow>(repo, 'decisions', clientRef, row);
	}
	return { data: null, error: error as Error };
}

export async function updateDecision(
	repo: RepoClient,
	id: string,
	patch: Partial<DecisionRow>
): Promise<{ data: DecisionRow | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	const safe = pickPatchable(patch as Record<string, unknown>, DECISION_PATCHABLE);
	let q = fromRepo(repo, 'decisions').update(safe).eq('id', id);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.select('*').single();
	return { data: (data as DecisionRow | null) ?? null, error: error as Error | null };
}

export function archiveDecision(repo: RepoClient, id: string) {
	return archiveRow(repo, 'decisions', id);
}

export function restoreDecision(repo: RepoClient, id: string) {
	return restoreRow(repo, 'decisions', id);
}
