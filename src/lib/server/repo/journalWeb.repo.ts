/**
 * FE-06 매매일지 화면 load용 읽기(사용자 세션 RLS 클라이언트, owner 필터). 쓰기 없음.
 */
import { applyJournalFilter, type JournalListFilter } from '$lib/server/domain/web/listFilters';
import type { RepoClient } from './client';
import { fromRepo } from './db';
import { requireOwnerId, withOwnerFilter } from './owner';

/**
 * 칩 건수용 kind 목록 상한. PostgREST max_rows(1000)에 조용히 잘리지 않도록 그보다 작게 두고,
 * 상한+1건을 요청해 넘치면 잘린 것으로 본다(truncated).
 */
export const JOURNAL_KINDS_CAP = 900;

/** 칩 건수용: 구분(type)만 빼고 같은 필터(종목·검색)를 건 행의 kind 목록. 상한을 넘으면 truncated. */
export async function listJournalKinds(
	repo: RepoClient,
	filter: Partial<Omit<JournalListFilter, 'type'>>
): Promise<{ data: string[]; error: Error | null; truncated: boolean }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'journal_entries').select('kind').is('archived_at', null);
	q = applyJournalFilter(q, { ticker: filter.ticker, q: filter.q });
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.limit(JOURNAL_KINDS_CAP + 1);
	if (error) return { data: [], error: error as Error, truncated: false };
	const kinds = ((data ?? []) as Array<{ kind: string }>).map((r) => r.kind);
	if (kinds.length > JOURNAL_KINDS_CAP) return { data: [], error: null, truncated: true };
	return { data: kinds, error: null, truncated: false };
}

/** 상세 직접 진입(`/journal/[id]`): 보관되지 않은 내 일지 한 건. 없으면 null. */
export async function getJournalEntryForWeb(
	repo: RepoClient,
	id: string
): Promise<{ data: Record<string, unknown> | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'journal_entries').select('*').eq('id', id).is('archived_at', null);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.maybeSingle();
	if (error) return { data: null, error: error as Error };
	return { data: (data as Record<string, unknown> | null) ?? null, error: null };
}

export type JournalInstrumentRow = {
	id: string;
	ticker: string;
	name: string;
	market: string;
	asset_type: 'stock' | 'etf' | 'bond' | 'cash';
	archived_at: string | null;
};

/** 폼 종목 후보·행 종목 표시(보관된 종목 포함 — 기존 행 표시용). */
export async function listJournalInstruments(
	repo: RepoClient
): Promise<{ data: JournalInstrumentRow[]; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'instruments').select('id, ticker, name, market, asset_type, archived_at');
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.order('ticker', { ascending: true });
	if (error) return { data: [], error: error as Error };
	return { data: (data ?? []) as JournalInstrumentRow[], error: null };
}

export type JournalReportRow = {
	id: string;
	kind: string;
	slug: string;
	report_date: string;
	title: string;
};

/** 리포트 연결 후보(최근 N건, 본문 없이). */
export async function listJournalReportOptions(
	repo: RepoClient,
	limit = 60
): Promise<{ data: JournalReportRow[]; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'reports')
		.select('id, kind, slug, report_date, title')
		.is('archived_at', null);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.order('report_date', { ascending: false }).limit(limit);
	if (error) return { data: [], error: error as Error };
	return { data: (data ?? []) as JournalReportRow[], error: null };
}

/** 연결한 리포트가 내 리포트인지(보관 포함 아님). 서버 액션 검사용 읽기. */
export async function getJournalReportOption(
	repo: RepoClient,
	id: string
): Promise<{ data: JournalReportRow | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'reports')
		.select('id, kind, slug, report_date, title')
		.eq('id', id)
		.is('archived_at', null);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.maybeSingle();
	if (error) return { data: null, error: error as Error };
	return { data: (data as JournalReportRow | null) ?? null, error: null };
}

/** R-CLS-05 봇 배지: 봇 id → 표시 이름. */
export async function listJournalBotNames(
	repo: RepoClient,
	botIds: string[]
): Promise<{ data: Map<string, string>; error: Error | null }> {
	const map = new Map<string, string>();
	const ids = [...new Set(botIds.filter(Boolean))];
	if (ids.length === 0) return { data: map, error: null };
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'bot_clients').select('id, name').in('id', ids);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	if (error) return { data: map, error: error as Error };
	for (const row of (data ?? []) as Array<{ id: string; name: string }>) map.set(row.id, row.name);
	return { data: map, error: null };
}
