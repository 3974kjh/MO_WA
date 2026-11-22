import type { Actions, PageServerLoad } from './$types';
import {
	forUser,
	ATTENTION_NEEDED_LIMIT,
	listAttentionNeeded,
	listInstrumentMeta,
	listOpenProposalRefs,
	listPortfolioPositionDetails,
	listPositionCards,
	listPrincipleHistory,
	listPrincipleQueue,
	listProposalHistory,
	listQueueProposals,
	loadDashboardValuation,
	type InstrumentMeta
} from '$lib/server/repo';
import {
	handleAck,
	handleApprove,
	handleApprovePrinciple,
	handleArchive,
	handleCorrect,
	handleDecidePrinciple,
	handleHold,
	handleReject,
	handleRestore
} from '$lib/server/web/proposalActions';
import { requireUser } from '$lib/server/web/requireUser';
import { INFO_LOAD_ERROR, publicListError } from '$lib/server/web/listError';
import {
	byCreatedDesc,
	byDecidedDesc,
	principleToQueueItem,
	toQueueItem,
	type CardLike,
	type PositionLike
} from '$lib/queue/view';
import type { CorrectionTarget } from '$lib/queue/proposals';
import { buildPortfolioRows } from '$lib/portfolio/view';

/** 포트폴리오 목록은 모두 첫 쪽(최근 20건) 고정이다. `?page=`·`?pageSize=`는 읽지 않는다. */
const HISTORY_PAGE = { page: 1, pageSize: 20, offset: 0, limit: 20 } as const;

/**
 * 포트폴리오 `/portfolio` — FE-05 보유·매수 계획 표·지표·비중(읽기 전용) + FE-07 변경 요청(#queue).
 * 확인 대기(pending+on_hold) · 지난 내역(종결) · 확인 필요(BE-19 attention_started_at 14일) · 보유(기록 수정 대상).
 * 포지션 요청(P-)과 원칙 개정 요청(R-)을 같은 목록에 최신순으로 섞어 보인다(각 최근 20건).
 * FE-05: 표 행(holding·planned·closed, 손익분기 가격·메모·감시 가격은 읽기 전용), 평가금액·환율(홈과 같은 valuation),
 * 행 배지·보류 건수용 열린 요청 참조만 더 읽는다. 쓰기 액션은 그대로.
 * 오류 원문은 서버 로그에만(publicListError). 값이 없으면 빈 배열 — 화면은 빈 상태만 보인다.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals.user);
	const repo = forUser(locals.supabase, user.id);

	const [queue, positions, attention, history, pQueue, pHistory, details, openRefs] =
		await Promise.all([
			listQueueProposals(repo, HISTORY_PAGE),
			listPositionCards(repo),
			listAttentionNeeded(repo),
			listProposalHistory(repo, HISTORY_PAGE),
			listPrincipleQueue(repo, HISTORY_PAGE),
			listPrincipleHistory(repo, HISTORY_PAGE),
			listPortfolioPositionDetails(repo),
			listOpenProposalRefs(repo)
		]);

	const positionCards = positions.error ? [] : positions.data;
	const queueCards = queue.error ? [] : queue.data.items;
	const attentionCards = attention.error ? [] : attention.data.positions;
	const historyCards = history.error ? [] : history.data.items;
	const principleAttention = attention.error ? [] : attention.data.principles;
	const principleQueue = pQueue.error ? [] : pQueue.data.items;
	const principleHistory = pHistory.error ? [] : pHistory.data.items;
	const queueErr = queue.error ?? pQueue.error;
	const historyErr = history.error ?? pHistory.error;
	const positionById = new Map<string, PositionLike>(positionCards.map((p) => [p.id, p]));
	const instrumentOf = (c: { instrument_id: string | null; position_id: string | null }) =>
		c.instrument_id ??
		(c.position_id ? (positionById.get(c.position_id)?.instrument_id ?? null) : null);

	const allCards = [...queueCards, ...attentionCards, ...historyCards];
	const detailRows = details.error ? [] : details.data;
	const [meta, valuation] = await Promise.all([
		listInstrumentMeta(repo, [
			...positionCards.map((p) => p.instrument_id),
			...detailRows.map((d) => d.instrument_id),
			...allCards.map(instrumentOf).filter((id): id is string => id != null)
		]),
		positions.error
			? Promise.resolve({ data: null, error: positions.error })
			: loadDashboardValuation(repo, positionCards)
	]);
	publicListError('portfolio.instruments', meta.error, INFO_LOAD_ERROR);
	const instrumentById = new Map<string, InstrumentMeta>((meta.data ?? []).map((m) => [m.id, m]));
	// 이 카드들은 포지션 제안 테이블에서만 읽는다(원칙은 principleToQueueItem). 타입만 좁히며 동작은 같다.
	const view = (c: (typeof allCards)[number]) =>
		toQueueItem(c as CardLike, positionById, instrumentById);

	const holdings: CorrectionTarget[] = positionCards.map((p) => {
		const m = instrumentById.get(p.instrument_id);
		return {
			id: p.id,
			name: m?.name?.trim() || m?.ticker?.trim() || '이름 없는 종목',
			status: p.status,
			currency: p.currency,
			qty: p.qty,
			avg_price: p.avg_price,
			approval_version: p.approval_version,
			asset_type: m?.asset_type ?? null
		};
	});

	const valueById = new Map((valuation.data?.positions ?? []).map((v) => [v.id, v.valueKrw]));
	const portfolioRows = buildPortfolioRows({
		details: detailRows,
		prices: positionCards,
		labels: instrumentById,
		valueById,
		open: openRefs.error ? [] : openRefs.data.positions
	});
	publicListError('portfolio.openRefs', openRefs.error, INFO_LOAD_ERROR);
	// 한쪽만 실패: 읽은 쪽 배지·보류 건수는 그대로 두고 서버 로그에만 남긴다(화면 문구·payload 변화 없음).
	publicListError('portfolio.openRefs.partial', openRefs.partialError, INFO_LOAD_ERROR);

	// 두 종류를 합쳐 전체 최신순 상위 N건(종류별 N건씩 받았으므로 합집합 상위 N건 = 전체 최신 N건).
	// 동점은 id로 고정. 건수 조회가 실패하면 실제 건수 대신 목록 길이.
	const attentionItems = [
		...attentionCards.map(view),
		...principleAttention.map(principleToQueueItem)
	]
		.sort(
			(a, b) =>
				Date.parse(b.attention_started_at ?? b.created_at) -
					Date.parse(a.attention_started_at ?? a.created_at) ||
				(a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
		)
		.slice(0, ATTENTION_NEEDED_LIMIT);
	publicListError('portfolio.attentionCount', attention.error ? null : attention.countError);
	const attentionTotal = Math.max(
		attention.error ? 0 : (attention.data.total ?? attentionItems.length),
		attentionItems.length
	);

	return {
		title: '포트폴리오',
		portfolio: {
			rows: portfolioRows,
			totalKrw: valuation.data?.totalKrw ?? null,
			usdkrw: valuation.data?.usdkrw ?? null,
			// 한쪽만 실패하면 읽은 쪽 합은 완전한 값처럼 보이므로 null(기존 '보류 건수를 불러오지 못했어요').
			holdCount: openRefs.error || openRefs.partialError ? null : openRefs.data.holdCount
		},
		portfolioError: publicListError('portfolio.details', positions.error ?? details.error),
		valuationError: publicListError('portfolio.valuation', valuation.error, INFO_LOAD_ERROR),
		queue: {
			items: [...queueCards.map(view), ...principleQueue.map(principleToQueueItem)].sort(
				byCreatedDesc
			),
			total: (queue.error ? 0 : queue.data.total) + (pQueue.error ? 0 : pQueue.data.total)
		},
		queueError: publicListError('portfolio.queue', queueErr),
		history: {
			items: [...historyCards.map(view), ...principleHistory.map(principleToQueueItem)].sort(
				byDecidedDesc
			),
			total: (history.error ? 0 : history.data.total) + (pHistory.error ? 0 : pHistory.data.total)
		},
		historyError: publicListError('portfolio.history', historyErr),
		holdings,
		positionsError: publicListError('portfolio.positions', positions.error),
		attentionNeeded: attentionItems,
		// 화면에는 아직 쓰지 않는다(잘림 안내 문구 확정 전): 목록 길이 / 실제 건수.
		attentionShown: attentionItems.length,
		attentionTotal,
		attentionError: publicListError('portfolio.attention', attention.error)
	};
};

export const actions: Actions = {
	approve: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleApprove(locals.supabase, user.id, await request.formData());
	},
	reject: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleReject(locals.supabase, user.id, await request.formData());
	},
	hold: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleHold(locals.supabase, user.id, await request.formData());
	},
	/** BE-19: apply_user_correction (R-VAL-P11) */
	correct: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleCorrect(locals.supabase, user.id, await request.formData());
	},
	/** BE-19: acknowledge_proposal / decide_principle_proposal('ack') */
	ack: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleAck(locals.supabase, user.id, await request.formData());
	},
	/** BE-17: approve_principle_proposal — 화면은 id만 보낸다(본문 고침 없음). G-2 5초 뒤 전송. */
	approvePrinciple: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleApprovePrinciple(locals.supabase, user.id, await request.formData());
	},
	/** BE-17: decide_principle_proposal — 화면은 reject·hold·unhold만 쓴다(ack는 ?/ack kind=principle). */
	decidePrinciple: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleDecidePrinciple(locals.supabase, user.id, await request.formData());
	},
	archive: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleArchive(locals.supabase, user.id, await request.formData());
	},
	restore: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		return handleRestore(locals.supabase, user.id, await request.formData());
	}
};
