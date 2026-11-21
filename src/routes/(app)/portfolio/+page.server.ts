import type { Actions, PageServerLoad } from './$types';
import { parsePageParams } from '$lib/server/domain/web/pagination';
import {
	forUser,
	listAttentionNeeded,
	listInstrumentMeta,
	listPositionCards,
	listPrincipleHistory,
	listPrincipleQueue,
	listProposalHistory,
	listQueueProposals,
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
	type PositionLike
} from '$lib/queue/view';
import type { CorrectionTarget } from '$lib/queue/proposals';

/** FE-07 '지난 내역' 첫 쪽(최근 결정 20건). */
const HISTORY_PAGE = { page: 1, pageSize: 20, offset: 0, limit: 20 } as const;

/**
 * 포트폴리오 `/portfolio` — FE-07 변경 요청(#queue).
 * 확인 대기(pending+on_hold) · 지난 내역(종결) · 확인 필요(BE-19 attention_started_at 14일) · 보유(기록 수정 대상).
 * 포지션 요청(P-)과 원칙 개정 요청(R-)을 같은 목록에 최신순으로 섞어 보인다(각 최근 20건).
 * 오류 원문은 서버 로그에만(publicListError). 값이 없으면 빈 배열 — 화면은 빈 상태만 보인다.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals.user);
	const repo = forUser(locals.supabase, user.id);
	const queueParams = parsePageParams(url, { defaultSize: 20 });

	const [queue, positions, attention, history, pQueue, pHistory] = await Promise.all([
		listQueueProposals(repo, queueParams),
		listPositionCards(repo),
		listAttentionNeeded(repo),
		listProposalHistory(repo, HISTORY_PAGE),
		listPrincipleQueue(repo, HISTORY_PAGE),
		listPrincipleHistory(repo, HISTORY_PAGE)
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
	const meta = await listInstrumentMeta(repo, [
		...positionCards.map((p) => p.instrument_id),
		...allCards.map(instrumentOf).filter((id): id is string => id != null)
	]);
	publicListError('portfolio.instruments', meta.error, INFO_LOAD_ERROR);
	const instrumentById = new Map<string, InstrumentMeta>((meta.data ?? []).map((m) => [m.id, m]));
	const view = (c: (typeof allCards)[number]) => toQueueItem(c, positionById, instrumentById);

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

	return {
		title: '포트폴리오',
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
		attentionNeeded: [...attentionCards.map(view), ...principleAttention.map(view)].sort(
			(a, b) =>
				Date.parse(b.attention_started_at ?? b.created_at) -
				Date.parse(a.attention_started_at ?? a.created_at)
		),
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
