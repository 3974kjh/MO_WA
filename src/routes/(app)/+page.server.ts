import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	HOME_BRIEFINGS_PAGE,
	HOME_QUEUE_PAGE,
	HOME_SERIES_DAYS
} from '$lib/server/domain/web/homePage';
import {
	countPendingProposals,
	forUser,
	getLatestIndicator,
	listBriefingsWithKospi,
	listIndicatorSeries,
	listInstrumentLabels,
	listPositionCards,
	listPrincipleQueue,
	listQueueProposals,
	loadDashboardValuation,
	type InstrumentLabel
} from '$lib/server/repo';
import { INFO_LOAD_ERROR, publicListError } from '$lib/server/web/listError';
import {
	HOME_QUEUE_PARTIAL_NOTE,
	HOME_TICKERS,
	isHomeQueueStatus,
	mergeHomeQueue,
	queueChanges,
	queueCurrency,
	type HomeIndicator,
	type HomePosition,
	type HomeQueueItem,
	type HomeTickerKey
} from '$lib/dashboard/home';

/**
 * 홈(`/`) — (app) 셸 안. FE-03(I-8) 대시보드 load.
 * L-8: `?page` / `?pageSize`를 받지 않는다(브리핑 1쪽 5건, 확인 대기 1쪽 5건 고정).
 * 오류 원문은 서버 로그에만 남기고 화면에는 일반 문구만 보낸다(publicListError).
 * 값이 없으면 빈 배열/null — 화면은 빈 상태를 보이고 시안 샘플 수치로 채우지 않는다.
 * 확인 대기: 포지션(P-)·투자 원칙 개정(R-) 요청 pending + on_hold를 최신순으로 합쳐 5건.
 *   건수 pill은 countPendingProposals(pending만). 한쪽만 못 읽으면 카드 전체를 오류로 바꾸지 않고
 *   읽힌 항목과 짧은 안내(queueNote)를 보인다. 둘 다 못 읽을 때만 queueError.
 * 로그아웃은 전용 경로 `/logout`(LOGOUT_PATH) — 여기로 action을 옮기지 않는다.
 */
export const load: PageServerLoad = async ({ locals, parent }) => {
	await parent();
	if (!locals.user?.id) redirect(303, '/login');

	const repo = forUser(locals.supabase, locals.user.id);
	const [positionsRes, indicatorRes, recentBriefings, queue, principleQueue, pending, series] =
		await Promise.all([
			listPositionCards(repo),
			Promise.all(HOME_TICKERS.map((t) => getLatestIndicator(repo, t.key))),
			listBriefingsWithKospi(repo, HOME_BRIEFINGS_PAGE),
			listQueueProposals(repo, HOME_QUEUE_PAGE),
			listPrincipleQueue(repo, HOME_QUEUE_PAGE),
			countPendingProposals(repo),
			listIndicatorSeries(repo, 'kospi', HOME_SERIES_DAYS)
		]);

	const positionCards = positionsRes.error ? [] : (positionsRes.data ?? []);
	const queueCards = queue.error ? [] : (queue.data?.items ?? []);
	const positionInstrument = new Map(positionCards.map((p) => [p.id, p.instrument_id]));
	const queueInstrument = (c: { instrument_id: string | null; position_id: string | null }) =>
		c.instrument_id ?? (c.position_id ? (positionInstrument.get(c.position_id) ?? null) : null);

	// 환율은 위 티커 조회에서 이미 읽었다(같은 getLatestIndicator('usdkrw')) — 다시 읽지 않는다.
	const usdkrwRes = indicatorRes[HOME_TICKERS.findIndex((t) => t.key === 'usdkrw')];
	const [valuation, labels] = await Promise.all([
		positionsRes.error
			? Promise.resolve({ data: null, error: positionsRes.error })
			: loadDashboardValuation(repo, positionCards, usdkrwRes),
		listInstrumentLabels(repo, [
			...positionCards.map((p) => p.instrument_id),
			...queueCards.map(queueInstrument).filter((id): id is string => id != null)
		])
	]);
	publicListError('home.instruments', labels.error, INFO_LOAD_ERROR);
	const labelById = new Map<string, InstrumentLabel>((labels.data ?? []).map((l) => [l.id, l]));
	const valueById = new Map((valuation.data?.positions ?? []).map((v) => [v.id, v.valueKrw]));

	const positions: HomePosition[] = positionCards.map((p) => {
		const l = labelById.get(p.instrument_id);
		return {
			id: p.id,
			instrument_id: p.instrument_id,
			name: l?.name ?? null,
			ticker: l?.ticker ?? null,
			status: p.status,
			currency: p.currency,
			qty: p.qty,
			avg_price: p.avg_price,
			trigger_price: p.trigger_price,
			trigger_direction: p.trigger_direction === 'above' ? 'above' : 'below',
			watch_only: Boolean(p.watch_only),
			price: p.latest_price,
			price_as_of: p.latest_price_as_of,
			value_krw: valueById.get(p.id) ?? null
		};
	});
	const positionCurrency = new Map(positionCards.map((p) => [p.id, p.currency]));
	// 같은 종목의 포지션 통화(이미 읽은 값). 신규 매수 요청처럼 포지션 연결이 없을 때만 쓴다.
	const instrumentCurrency = new Map(positionCards.map((p) => [p.instrument_id, p.currency]));

	const positionQueueItems: HomeQueueItem[] = queueCards
		.filter((c) => isHomeQueueStatus(c.status))
		.map((c) => {
			const instrumentId = queueInstrument(c);
			const l = instrumentId ? labelById.get(instrumentId) : undefined;
			// 통화를 모르면 KRW로 짐작하지 않는다(null → 화면에서 기호 없이 숫자만).
			const fallback =
				(c.position_id && positionCurrency.get(c.position_id)) ||
				(instrumentId && instrumentCurrency.get(instrumentId)) ||
				null;
			return {
				kind: 'position',
				id: c.id,
				status: c.status as HomeQueueItem['status'],
				change_type: c.change_type,
				name: l?.name ?? null,
				ticker: l?.ticker ?? null,
				clause_ref: null,
				currency: queueCurrency(c.proposed_values, c.current_values, fallback),
				changes: queueChanges(c.proposed_values, c.current_values),
				created_at: c.created_at
			};
		});
	const principleCards = principleQueue.error ? [] : (principleQueue.data?.items ?? []);
	const principleQueueItems: HomeQueueItem[] = principleCards
		.filter((c) => isHomeQueueStatus(c.status))
		.map((c) => ({
			kind: 'principle',
			id: c.id,
			status: c.status as HomeQueueItem['status'],
			change_type: 'principle',
			name: null,
			ticker: null,
			clause_ref: c.clause_ref?.trim() || null,
			currency: 'KRW',
			changes: [],
			created_at: c.created_at
		}));
	const queueItems = mergeHomeQueue(positionQueueItems, principleQueueItems, HOME_QUEUE_PAGE.limit);
	const queueTotal =
		(queue.error ? 0 : (queue.data?.total ?? positionQueueItems.length)) +
		(principleQueue.error ? 0 : (principleQueue.data?.total ?? principleQueueItems.length));
	// 오류 원문은 서버 로그에만. 둘 다 실패면 카드 오류, 한쪽만이면 안내 한 줄(과소 표시임을 밝힌다).
	const positionQueueError = publicListError('home.queue', queue.error, INFO_LOAD_ERROR);
	const principleQueueError = publicListError(
		'home.queue.principles',
		principleQueue.error,
		INFO_LOAD_ERROR
	);
	const pendingError = publicListError('home.queue.pending', pending.error, INFO_LOAD_ERROR);
	const queueError = positionQueueError && principleQueueError ? INFO_LOAD_ERROR : null;
	const queueNote = queueError
		? null
		: principleQueueError
			? HOME_QUEUE_PARTIAL_NOTE.principle
			: positionQueueError
				? HOME_QUEUE_PARTIAL_NOTE.position
				: pendingError
					? HOME_QUEUE_PARTIAL_NOTE.count
					: null;

	const tickers = {} as Record<HomeTickerKey, HomeIndicator | null>;
	let tickerFailed = false;
	HOME_TICKERS.forEach((t, i) => {
		const r = indicatorRes[i];
		if (r.error) {
			publicListError(`home.ticker.${t.key}`, r.error, INFO_LOAD_ERROR);
			tickerFailed = true;
		}
		tickers[t.key] = r.error ? null : (r.data ?? null);
	});

	// 화면 계약은 그대로, 오류는 서버 로그에만(원문은 클라이언트로 보내지 않는다).
	const briefingsError = publicListError('home.briefings', recentBriefings.error, INFO_LOAD_ERROR);

	return {
		user: {
			id: locals.user.id,
			email: locals.user.email ?? null
		},
		valuation: valuation.data,
		valuationError: publicListError('home.valuation', valuation.error, INFO_LOAD_ERROR),
		positions,
		positionsError: positionsRes.error ? INFO_LOAD_ERROR : null,
		kospi: tickers.kospi,
		tickers,
		tickersError: tickerFailed ? INFO_LOAD_ERROR : null,
		queue: {
			items: queueItems,
			total: queueTotal,
			pendingCount: pending.error ? null : pending.data
		},
		queueError,
		queueNote,
		kospiSeries: series.error ? [] : series.data,
		kospiSeriesError: publicListError('home.kospiSeries', series.error, INFO_LOAD_ERROR),
		recentBriefings: recentBriefings.error ? [] : (recentBriefings.data?.items ?? []).slice(0, 5),
		briefingsError
	};
};
