import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { parseDetailMode } from '$lib/routing/listQuery';
import { forUser, getEquityReportBySlug, listInstrumentNamesByTicker } from '$lib/server/repo';
import { readBriefingBody } from '$lib/server/web/briefingBody';
import { INFO_LOAD_ERROR, publicListError } from '$lib/server/web/listError';
import { requireUser } from '$lib/server/web/requireUser';
import { analysisBack } from '$lib/stocks/view';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * FE-11 `/analyses/[slug]?mode=&from=` 분석 리포트(읽기 전용, 게시·장 접기 없음).
 * - kind=equity_analysis만, 보관 제외. slug가 겹치면 report_date 최신 1건(Q-T1 결정 전 임시).
 * - 본문은 렌더하지 않는다: 상세 모드에서만 저장된 렌더 캐시를 브리핑 상세와 같은 함수로 읽는다(ReportView·캐시 변경 없음).
 * - '← 종목'(결정 1): `?from=`이 리포트 tickers 안이면 그 종목, 아니면 tickers 1개 → 그 종목, 여러 개 → /stocks.
 *   모바일 상단 '뒤로'도 같은 곳(backHref).
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = requireUser(locals.user);
	if (params.slug.length > 80 || !SLUG.test(params.slug)) error(404, 'Not found');
	const repo = forUser(locals.supabase, user.id);
	const { data: report, error: err } = await getEquityReportBySlug(repo, params.slug);
	if (err) {
		publicListError('analysis.meta', err, INFO_LOAD_ERROR);
		error(503, '잠시 후 다시 시도해 주세요.');
	}
	if (!report) error(404, 'Not found');
	const back = analysisBack(url.searchParams.get('from'), report.tickers);
	const names = back.ticker ? await listInstrumentNamesByTicker(repo, [back.ticker]) : null;
	const backName = names?.data[0]?.name ?? back.ticker;
	const mode = parseDetailMode(url.searchParams);
	return {
		title: '분석 리포트',
		backHref: back.href,
		backLabel: backName ? `← ${backName} 종목 화면` : '← 종목 목록',
		mode,
		report,
		body: mode === 'detail' ? await readBriefingBody(repo, report) : null
	};
};
