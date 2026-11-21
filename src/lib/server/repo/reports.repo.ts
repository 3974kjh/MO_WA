import type { ReportRow } from '$lib/types/mowa.contract';
import { serverCreateStamps, stripClientIdentity, type RepoClient } from './client';
import { requireOwnerId, withOwnerFilter } from './owner';
import { fromTable } from './supabaseTable';

export type ReportCreateInput = Partial<ReportRow> &
	Pick<ReportRow, 'kind' | 'slug' | 'title' | 'report_date' | 'body_md' | 'domain'>;

/** List non-archived reports for owner (R-SYS-01). */
export async function listReports(
	repo: RepoClient,
	opts: { includeArchived?: boolean } = {}
): Promise<{ data: ReportRow[]; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromTable(repo.db, 'reports').select('*');
	q = withOwnerFilter(q, ownerId);
	if (!opts.includeArchived) q = q.is('archived_at', null);
	const { data, error } = await q;
	return { data: (data ?? []) as ReportRow[], error: error as Error | null };
}

export async function getReportById(
	repo: RepoClient,
	id: string
): Promise<{ data: ReportRow | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromTable(repo.db, 'reports').select('*').eq('id', id);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.maybeSingle();
	return { data: (data as ReportRow | null) ?? null, error: error as Error | null };
}

/** Create report — server fills owner_id + source_bot_id (R-PERM-03). */
export async function createReport(
	repo: RepoClient,
	input: ReportCreateInput
): Promise<{ data: ReportRow | null; error: Error | null }> {
	const stamps = serverCreateStamps(repo.actor);
	const row = {
		...stripClientIdentity(input as Record<string, unknown>),
		...stamps
	};
	const { data, error } = await fromTable(repo.db, 'reports').insert(row).select('*').single();
	return { data: (data as ReportRow | null) ?? null, error: error as Error | null };
}

export async function updateReport(
	repo: RepoClient,
	id: string,
	patch: Partial<ReportRow>
): Promise<{ data: ReportRow | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	const safe = stripClientIdentity(patch as Record<string, unknown>);
	let q = fromTable(repo.db, 'reports').update(safe).eq('id', id);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.select('*').single();
	return { data: (data as ReportRow | null) ?? null, error: error as Error | null };
}
