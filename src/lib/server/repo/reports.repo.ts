import type { ReportRow } from '$lib/types/mowa.contract';
import { archiveRow, restoreRow } from './archive';
import { serverCreateStamps, stripClientIdentity, type RepoClient } from './client';
import { fromRepo } from './db';
import { requireOwnerId, withOwnerFilter } from './owner';
import { pickPatchable, REPORT_PATCHABLE } from './patch';
import { stripRenderFields } from '$lib/server/markdown/renderFields';

export type ReportCreateInput = Partial<ReportRow> &
	Pick<ReportRow, 'kind' | 'slug' | 'title' | 'report_date' | 'body_md' | 'domain'>;

/** List non-archived reports for owner (R-SYS-01). */
export async function listReports(
	repo: RepoClient,
	opts: { includeArchived?: boolean } = {}
): Promise<{ data: ReportRow[]; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'reports').select('*');
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
	let q = fromRepo(repo, 'reports').select('*').eq('id', id);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.maybeSingle();
	return { data: (data as ReportRow | null) ?? null, error: error as Error | null };
}

/**
 * Create report — server fills owner_id + source_bot_id (R-PERM-03). No runRules here (M-5).
 * 렌더 결과 필드(body_blocks·toc와 이름 변형)는 stripRenderFields로 버린다(FE-04 쓰기 경로 계약, reportsWritePath.spec.ts).
 */
export async function createReport(
	repo: RepoClient,
	input: ReportCreateInput
): Promise<{ data: ReportRow | null; error: Error | null }> {
	const stamps = serverCreateStamps(repo.actor);
	const row = {
		...stripClientIdentity(stripRenderFields(input as Record<string, unknown>), 'reports'),
		...stamps
	};
	const { data, error } = await fromRepo(repo, 'reports').insert(row).select('*').single();
	return { data: (data as ReportRow | null) ?? null, error: error as Error | null };
}

/** Update only report patchable fields (M-3). 렌더 결과 필드는 허용 목록에 없고, stripRenderFields도 한 번 더 거친다. */
export async function updateReport(
	repo: RepoClient,
	id: string,
	patch: Partial<ReportRow>
): Promise<{ data: ReportRow | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	const safe = pickPatchable(stripRenderFields(patch as Record<string, unknown>), REPORT_PATCHABLE);
	let q = fromRepo(repo, 'reports').update(safe).eq('id', id);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.select('*').single();
	return { data: (data as ReportRow | null) ?? null, error: error as Error | null };
}

export function archiveReport(repo: RepoClient, id: string) {
	return archiveRow(repo, 'reports', id);
}

export function restoreReport(repo: RepoClient, id: string) {
	return restoreRow(repo, 'reports', id);
}
