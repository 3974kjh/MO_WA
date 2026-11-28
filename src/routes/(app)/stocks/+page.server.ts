import type { PageServerLoad } from './$types';
import {
	forUser,
	getLatestIndicator,
	listEquityReports,
	listLatestQuotes,
	listStockInstruments,
	listStockPositions
} from '$lib/server/repo';
import { INFO_LOAD_ERROR, LIST_LOAD_ERROR, publicListError } from '$lib/server/web/listError';
import { requireUser } from '$lib/server/web/requireUser';
import { buildStockBoard } from '$lib/server/web/stocksBoard';
import { parseStocksQuery } from '$lib/stocks/view';

/**
 * FE-11 `/stocks` 보드(표시 전용). `?q=&f=all|hold|watch&sort=default|chg|trig` — 허용 밖 값은 기본값.
 * 종목·포지션·시세 중 하나라도 못 읽으면 보드 전체 오류(원문은 서버 로그만). 리포트·환율만 실패하면
 * 그 값 없이 보인다(리포트 배지 없음 · 달러 종목 평가금액 없음).
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals.user);
	const repo = forUser(locals.supabase, user.id);
	const query = parseStocksQuery(url.searchParams);
	const loadedAt = new Date().toISOString();

	const [inst, pos, reports, fx] = await Promise.all([
		listStockInstruments(repo),
		listStockPositions(repo),
		listEquityReports(repo),
		getLatestIndicator(repo, 'usdkrw')
	]);
	const quotes = inst.error
		? null
		: await listLatestQuotes(
				repo,
				inst.data.map((i) => i.id)
			);
	const error = publicListError(
		'stocks.board',
		inst.error ?? pos.error ?? quotes?.error,
		LIST_LOAD_ERROR
	);
	const reportsError = publicListError('stocks.reports', reports.error, INFO_LOAD_ERROR);
	publicListError('stocks.fx', fx.error, INFO_LOAD_ERROR);
	const board = error
		? { rows: [], drafts: [] }
		: buildStockBoard({
				instruments: inst.data,
				positions: pos.data,
				quotes: quotes?.data ?? [],
				reports: reports.data,
				usdkrw: fx.data ? { value: fx.data.value, as_of: fx.data.as_of } : null
			});
	return { title: '종목', query, loadedAt, error, reportsError, ...board };
};
