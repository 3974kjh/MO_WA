/**
 * FE-06 매매일지 load 공통부(`/journal`·`/journal/[id]`).
 *
 * - 목록: BE-11 listJournalPage(서버 페이지네이션 30건, ?type=&ticker=&q=&page=)를 그대로 쓴다.
 * - 칩 건수: 구분만 빼고 같은 필터를 건 kind 목록(listJournalKinds).
 * - 종목·리포트·봇 이름은 표시·폼 후보용 읽기. 하나가 실패해도 목록은 보인다(부분 오류는 auxError).
 * - 상세 직접 진입: 목록 쪽에 없으면 한 건을 따로 읽는다(이전/다음은 목록 안에서만).
 * DB 오류 원문은 페이지 데이터로 보내지 않는다(publicListError).
 */
import { error } from '@sveltejs/kit';
import type { User } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseJournalQuery } from '$lib/routing/listQuery';
import { parsePageParams } from '$lib/server/domain/web/pagination';
import {
	forUser,
	getJournalEntryForWeb,
	listJournalBotNames,
	listJournalInstruments,
	listJournalKinds,
	listJournalPage,
	listJournalReportOptions
} from '$lib/server/repo';
import { INFO_LOAD_ERROR, publicListError } from '$lib/server/web/listError';
import {
	countKinds,
	emptyKindCounts,
	toJournalItem,
	type InstrumentOption,
	type JournalItem,
	type ReportOption
} from '$lib/journal/view';
import type { Database } from '$lib/types/database.types';

export const JOURNAL_PAGE_SIZE = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isJournalId(id: string): boolean {
	return UUID_RE.test(id);
}

export async function loadJournal(
	locals: { supabase: SupabaseClient<Database>; user: User },
	url: URL,
	selectedId: string | null = null
) {
	const repo = forUser(locals.supabase, locals.user.id);
	const params = parsePageParams(url, { defaultSize: JOURNAL_PAGE_SIZE });
	const query = parseJournalQuery(url.searchParams);
	const filter = { type: query.type, ticker: query.ticker, q: query.q };

	const [list, kinds, instruments, reports] = await Promise.all([
		listJournalPage(repo, params, query),
		listJournalKinds(repo, filter),
		listJournalInstruments(repo),
		listJournalReportOptions(repo)
	]);

	const listRows = list.error ? [] : list.data.items;
	let selectedRow: Record<string, unknown> | null = null;
	if (selectedId) {
		selectedRow = listRows.find((r) => String(r.id) === selectedId) ?? null;
		if (!selectedRow) {
			const one = await getJournalEntryForWeb(repo, selectedId);
			if (one.error) error(503, '잠시 후 다시 시도해 주세요.');
			if (!one.data) error(404, 'Not found');
			selectedRow = one.data;
		}
	}

	const botIds = [...listRows, ...(selectedRow ? [selectedRow] : [])]
		.map((r) => (typeof r.source_bot_id === 'string' ? r.source_bot_id : ''))
		.filter(Boolean);
	const bots = await listJournalBotNames(repo, botIds);

	const instrumentOptions: InstrumentOption[] = instruments.data.map((i) => ({
		id: i.id,
		ticker: i.ticker,
		name: i.name,
		market: i.market,
		asset_type: i.asset_type,
		archived: i.archived_at != null
	}));
	const ctx = {
		instruments: new Map(instrumentOptions.map((i) => [i.id, i])),
		botNames: bots.data
	};
	const items: JournalItem[] = listRows.map((r) => toJournalItem(r, ctx));
	const selected = selectedRow ? toJournalItem(selectedRow, ctx) : null;
	const reportOptions: ReportOption[] = reports.data.map((r) => ({
		id: r.id,
		kind: r.kind,
		slug: r.slug,
		report_date: r.report_date,
		title: r.title
	}));

	const kindsTruncated = !kinds.error && kinds.truncated;
	const auxErr =
		kinds.error ??
		(kindsTruncated ? new Error('journal kinds truncated') : null) ??
		instruments.error ??
		reports.error ??
		bots.error;
	return {
		title: '매매일지',
		query,
		journal: {
			items,
			page: list.data.page,
			pageSize: list.data.pageSize,
			total: list.data.total,
			totalPages: list.data.totalPages
		},
		kindCounts: kinds.error || kindsTruncated ? emptyKindCounts() : countKinds(kinds.data),
		kindCountsOk: !kinds.error && !kindsTruncated,
		instruments: instrumentOptions,
		reports: reportOptions,
		selected,
		error: publicListError('journal', list.error),
		auxError: publicListError('journal-aux', auxErr, INFO_LOAD_ERROR)
	};
}

export type JournalPageData = Awaited<ReturnType<typeof loadJournal>>;
