import type { ReportRow } from '$lib/types/mowa.contract';
import { archiveRow, restoreRow } from './archive';
import { serverCreateStamps, stripClientIdentity, type RepoClient } from './client';
import { fromRepo, rpcFromRepo } from './db';
import { requireOwnerId, withOwnerFilter } from './owner';
import { pickPatchable, REPORT_PATCHABLE } from './patch';
import { stripRenderFields } from '$lib/server/markdown/cache';

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

/** Natural key (owner, kind, report_date, slug) — includes archived rows (unique key spans them). */
export async function getReportByNaturalKey(
	repo: RepoClient,
	key: { kind: string; reportDate: string; slug: string }
): Promise<{ data: ReportRow | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'reports')
		.select('*')
		.eq('kind', key.kind)
		.eq('report_date', key.reportDate)
		.eq('slug', key.slug);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.maybeSingle();
	return { data: (data as ReportRow | null) ?? null, error: error as Error | null };
}

export type ReportSourceInput = {
	label: string;
	publisher: string;
	accessed_at: string;
	url?: string | null;
	is_primary?: boolean;
};

/**
 * Replace the full source list of a report (R-VAL-R07: upsert replaces sources).
 * Not transactional: delete then insert; a failed insert leaves the report without sources
 * until the bot retries the idempotent upsert.
 */
export async function replaceReportSources(
	repo: RepoClient,
	reportId: string,
	sources: readonly ReportSourceInput[]
): Promise<{ error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let del = fromRepo(repo, 'report_sources').delete().eq('report_id', reportId);
	del = withOwnerFilter(del, ownerId);
	const { error: delError } = await del;
	if (delError) return { error: delError as Error };
	if (sources.length === 0) return { error: null };
	const rows = sources.map((s, i) => ({
		report_id: reportId,
		label: s.label,
		publisher: s.publisher,
		accessed_at: s.accessed_at,
		url: s.url ?? null,
		is_primary: s.is_primary ?? false,
		sort: i
	}));
	const { error } = await fromRepo(repo, 'report_sources').insert(rows);
	return { error: (error as Error | null) ?? null };
}

/** Create report — server fills owner_id + source_bot_id (R-PERM-03). No runRules here (M-5).
 * body_blocks/toc are always stripped (BE-07); use setReportRenderCache after insert. */
export async function createReport(
	repo: RepoClient,
	input: ReportCreateInput
): Promise<{ data: ReportRow | null; error: Error | null }> {
	const stamps = serverCreateStamps(repo.actor);
	const stripped = stripRenderFields(
		stripClientIdentity(input as Record<string, unknown>, 'reports') as Record<string, unknown>
	);
	const row = {
		...stripped,
		...stamps
	};
	const { data, error } = await fromRepo(repo, 'reports').insert(row).select('*').single();
	return { data: (data as ReportRow | null) ?? null, error: error as Error | null };
}

/** Update only report patchable fields (M-3). body_blocks/toc never pass through. */
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

/**
 * Write-time render cache via SECURITY DEFINER RPC (column GRANTs revoked on reports).
 * Only the server render path should call this — never trust client/bot args.
 */
export async function setReportRenderCache(
	repo: RepoClient,
	reportId: string,
	columns: { body_blocks: unknown; toc: unknown }
): Promise<{ error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	const { error } = await rpcFromRepo(repo, 'mowa_set_report_render_cache', {
		p_report_id: reportId,
		p_owner_id: ownerId,
		p_body_blocks: columns.body_blocks,
		p_toc: columns.toc
	});
	return { error: (error as Error | null) ?? null };
}

export function archiveReport(repo: RepoClient, id: string) {
	return archiveRow(repo, 'reports', id);
}

export function restoreReport(repo: RepoClient, id: string) {
	return restoreRow(repo, 'reports', id);
}
