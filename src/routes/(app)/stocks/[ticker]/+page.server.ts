import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	forUser,
	getStockInstrument,
	listBriefingMentions,
	listEquityReports,
	listJournalMentions,
	listQuoteSeries,
	listStockPositions,
	listTargetHistory,
	loadDashboardValuation
} from '$lib/server/repo';
import { INFO_LOAD_ERROR, publicListError } from '$lib/server/web/listError';
import { requireUser } from '$lib/server/web/requireUser';
import { isStockAsset, isTickerParam, latestBySlug, stockMemo } from '$lib/stocks/view';

/**
 * FE-11 `/stocks/[ticker]` 상세(표시 전용, 기록을 고치지 않음).
 * - 형식 밖 코드는 DB를 읽지 않고 404. 없는 종목·보관된 종목도 404(+error.svelte '없는 종목').
 * - bond·cash(결정 3)는 200 + 포트폴리오 안내만(다른 데이터는 읽지 않는다).
 * - 카드별로 따로 읽고 실패도 카드별(원문은 서버 로그만). 종목 행을 못 읽을 때만 전체 503.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requireUser(locals.user);
	if (!isTickerParam(params.ticker)) error(404, 'Not found');
	const repo = forUser(locals.supabase, user.id);
	const inst = await getStockInstrument(repo, params.ticker);
	if (inst.error) {
		publicListError('stock.instrument', inst.error, INFO_LOAD_ERROR);
		error(503, '잠시 후 다시 시도해 주세요.');
	}
	if (!inst.data || inst.data.archived_at) error(404, 'Not found');
	const { archived_at: _a, ...instrument } = inst.data;
	void _a;
	if (!isStockAsset(instrument.asset_type)) {
		return { title: instrument.name, instrument, portfolioOnly: true as const };
	}

	const [pos, series, reports, targets, mentions, journal] = await Promise.all([
		listStockPositions(repo, instrument.id),
		listQuoteSeries(repo, instrument.id),
		listEquityReports(repo, instrument.ticker),
		listTargetHistory(repo, instrument.id),
		listBriefingMentions(repo, instrument.ticker),
		listJournalMentions(repo, instrument.ticker)
	]);
	const holding = pos.data.find((p) => p.status === 'holding') ?? null;
	// 비중·평가금액은 홈·포트폴리오와 같은 계산(전체 보유 × 최신가 × 환율). 보유일 때만 읽는다.
	const valuation = holding ? await loadDashboardValuation(repo) : null;
	const value = valuation?.data?.positions.find((v) => v.id === holding?.id)?.valueKrw ?? null;
	const err = (scope: string, e: Error | null | undefined) =>
		publicListError(`stock.${scope}`, e, INFO_LOAD_ERROR);

	return {
		title: instrument.name,
		portfolioOnly: false as const,
		instrument,
		positions: pos.data,
		positionsError: err('positions', pos.error),
		series: series.data,
		seriesError: err('series', series.error),
		reports: latestBySlug(reports.data).map(({ meta: _m, ...r }) => (void _m, r)),
		memo: stockMemo(reports.data, instrument.ticker),
		reportsError: err('reports', reports.error),
		targets: targets.data,
		targetsError: err('targets', targets.error),
		mentions: mentions.data,
		journal: journal.data,
		mentionsError: err('mentions', mentions.error),
		journalError: err('journal', journal.error),
		holdingValue: value,
		totalKrw: valuation?.data?.totalKrw ?? null,
		valuationError: err('valuation', valuation?.error)
	};
};
