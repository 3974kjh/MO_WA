/**
 * FE-07 후속: 홈 '확인 대기' load — 포지션(P-)·원칙(R-) 요청을 같이 싣고,
 * 한쪽만 못 읽으면 카드 전체를 오류로 바꾸지 않는다(리뷰 Low-2). 건수 pill은 pending만(Nit-3).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOME_QUEUE_PARTIAL_NOTE } from '$lib/dashboard/home';

type AnyLoader = (...args: unknown[]) => Promise<unknown>;

const RAW = { code: '42501', message: 'permission denied for table principle_proposals' };

const repo = vi.hoisted(() => ({
	forUser: vi.fn(() => ({})),
	listPositionCards: vi.fn<AnyLoader>(),
	getLatestIndicator: vi.fn<AnyLoader>(),
	listBriefingsWithKospi: vi.fn<AnyLoader>(),
	listQueueProposals: vi.fn<AnyLoader>(),
	listPrincipleQueue: vi.fn<AnyLoader>(),
	countPendingProposals: vi.fn<AnyLoader>(),
	listIndicatorSeries: vi.fn<AnyLoader>(),
	listInstrumentLabels: vi.fn<AnyLoader>(),
	loadDashboardValuation: vi.fn<AnyLoader>()
}));
vi.mock('$lib/server/repo', () => repo);

import { load } from './+page.server';

const posCard = (over: Record<string, unknown>) => ({
	id: 'q1',
	display_id: 'P-0031',
	change_type: 'set_qty_avg',
	status: 'pending',
	proposed_values: { qty: 5 },
	current_values: { qty: 4, currency: 'KRW' },
	position_id: null,
	instrument_id: 'i1',
	created_at: '2026-11-19T00:00:00Z',
	...over
});

const prinCard = (over: Record<string, unknown>) => ({
	id: 'r1',
	display_id: 'R-0009',
	status: 'pending',
	clause_ref: '2-1',
	body_preview: '원칙 본문',
	body_truncated: false,
	created_at: '2026-11-20T00:00:00Z',
	...over
});

const page = (items: unknown[], total = items.length) => ({
	data: { items, total },
	error: null
});
const failed = { data: { items: [], total: 0 }, error: RAW };

type HomeOut = {
	queue: {
		items: Array<{
			kind: string;
			id: string;
			status: string;
			clause_ref: string | null;
			currency: 'KRW' | 'USD' | null;
		}>;
		total: number;
		pendingCount: number | null;
	};
	queueError: string | null;
	queueNote: string | null;
};

const call = async () =>
	(await (load as unknown as (e: unknown) => Promise<unknown>)({
		locals: { user: { id: 'u1', email: null }, supabase: {} },
		parent: async () => ({})
	})) as HomeOut;

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	log = vi.spyOn(console, 'error').mockImplementation(() => {});
	repo.listPositionCards.mockResolvedValue({ data: [], error: null });
	repo.getLatestIndicator.mockResolvedValue({ data: null, error: null });
	repo.listBriefingsWithKospi.mockResolvedValue({ data: { items: [] }, error: null });
	repo.listIndicatorSeries.mockResolvedValue({ data: [], error: null });
	repo.listInstrumentLabels.mockResolvedValue({
		data: [{ id: 'i1', name: '테스트종목', ticker: 'TST' }],
		error: null
	});
	repo.loadDashboardValuation.mockResolvedValue({
		data: { totalKrw: null, usdkrw: null, usdkrwAsOf: null, positions: [] },
		error: null
	});
	repo.listQueueProposals.mockResolvedValue(page([]));
	repo.listPrincipleQueue.mockResolvedValue(page([]));
	repo.countPendingProposals.mockResolvedValue({ data: 0, error: null });
});
afterEach(() => {
	log.mockRestore();
	vi.clearAllMocks();
});

describe('홈 확인 대기: 포지션 + 투자 원칙 개정 요청', () => {
	it('원칙 요청(R-)도 같은 목록에 최신순으로 싣고 건수는 두 목록 합', async () => {
		repo.listQueueProposals.mockResolvedValue(page([posCard({})], 3));
		repo.listPrincipleQueue.mockResolvedValue(page([prinCard({})], 2));
		repo.countPendingProposals.mockResolvedValue({ data: 4, error: null });
		const out = await call();
		expect(out.queue.items.map((i) => `${i.kind}:${i.id}`)).toEqual([
			'principle:r1',
			'position:q1'
		]);
		expect(out.queue.items[0].clause_ref).toBe('2-1');
		expect(out.queue.total).toBe(5);
		expect(out.queue.pendingCount).toBe(4);
		expect(out.queueError).toBeNull();
		expect(out.queueNote).toBeNull();
		expect(repo.listPrincipleQueue).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ offset: 0, limit: 5 })
		);
	});

	it('pending·on_hold 모두 싣고(포지션과 같은 기준) 다른 상태는 뺀다', async () => {
		repo.listQueueProposals.mockResolvedValue(
			page([posCard({ id: 'q1', status: 'on_hold' }), posCard({ id: 'q2', status: 'approved' })])
		);
		repo.listPrincipleQueue.mockResolvedValue(
			page([
				prinCard({ id: 'r1', status: 'pending' }),
				prinCard({ id: 'r2', status: 'on_hold', created_at: '2026-11-18T00:00:00Z' }),
				prinCard({ id: 'r3', status: 'rejected' })
			])
		);
		const out = await call();
		expect(out.queue.items.map((i) => `${i.id}:${i.status}`)).toEqual([
			'r1:pending',
			'q1:on_hold',
			'r2:on_hold'
		]);
	});

	it('합친 목록은 5건까지만(나머지는 외 N건)', async () => {
		const ts = (d: number) => `2026-11-${String(d).padStart(2, '0')}T00:00:00Z`;
		repo.listQueueProposals.mockResolvedValue(
			page([1, 3, 5, 7, 9].map((d) => posCard({ id: `q${d}`, created_at: ts(d) })).reverse(), 6)
		);
		repo.listPrincipleQueue.mockResolvedValue(
			page([2, 4, 6, 8, 10].map((d) => prinCard({ id: `r${d}`, created_at: ts(d) })).reverse(), 5)
		);
		const out = await call();
		expect(out.queue.items.map((i) => i.id)).toEqual(['r10', 'q9', 'r8', 'q7', 'r6']);
		expect(out.queue.total).toBe(11);
	});

	it('원칙만 못 읽으면 포지션 항목은 그대로 + 안내(카드 오류 아님), 원문은 싣지 않는다', async () => {
		repo.listQueueProposals.mockResolvedValue(page([posCard({})], 1));
		repo.listPrincipleQueue.mockResolvedValue(failed);
		repo.countPendingProposals.mockResolvedValue({ data: 0, error: RAW });
		const out = await call();
		expect(out.queueError).toBeNull();
		expect(out.queue.items.map((i) => i.id)).toEqual(['q1']);
		expect(out.queue.total).toBe(1);
		// 건수를 못 읽었으면 0으로 보이지 않게 null(pill 숨김)
		expect(out.queue.pendingCount).toBeNull();
		expect(out.queueNote).toBe(HOME_QUEUE_PARTIAL_NOTE.principle);
		const json = JSON.stringify(out);
		expect(json).not.toContain('permission denied');
		expect(json).not.toContain('42501');
		expect(log).toHaveBeenCalled();
	});

	it('포지션만 못 읽으면 원칙 항목은 그대로 + 안내', async () => {
		repo.listQueueProposals.mockResolvedValue(failed);
		repo.listPrincipleQueue.mockResolvedValue(page([prinCard({})]));
		const out = await call();
		expect(out.queueError).toBeNull();
		expect(out.queue.items.map((i) => i.id)).toEqual(['r1']);
		expect(out.queueNote).toBe(HOME_QUEUE_PARTIAL_NOTE.position);
	});

	it('건수만 못 읽으면 목록은 그대로, pill은 숨기고 짧은 안내', async () => {
		repo.listQueueProposals.mockResolvedValue(page([posCard({})]));
		repo.countPendingProposals.mockResolvedValue({ data: 0, error: RAW });
		const out = await call();
		expect(out.queueError).toBeNull();
		expect(out.queue.items).toHaveLength(1);
		expect(out.queue.pendingCount).toBeNull();
		expect(out.queueNote).toBe(HOME_QUEUE_PARTIAL_NOTE.count);
	});

	it('둘 다 못 읽으면 카드 오류(일반 문구)만, 안내·항목 없음', async () => {
		repo.listQueueProposals.mockResolvedValue(failed);
		repo.listPrincipleQueue.mockResolvedValue(failed);
		repo.countPendingProposals.mockResolvedValue({ data: 0, error: RAW });
		const out = await call();
		expect(out.queueError).toBe('정보를 불러오지 못했어요.');
		expect(out.queueNote).toBeNull();
		expect(out.queue.items).toEqual([]);
		expect(out.queue.total).toBe(0);
		expect(out.queue.pendingCount).toBeNull();
	});

	it('둘 다 0건이면 빈 목록·건수 0·오류/안내 없음', async () => {
		const out = await call();
		expect(out.queue).toEqual({ items: [], total: 0, pendingCount: 0 });
		expect(out.queueError).toBeNull();
		expect(out.queueNote).toBeNull();
	});
});

describe('홈 확인 대기: 큐 항목 통화(KRW로 짐작하지 않음)', () => {
	const buy = (over: Record<string, unknown>) =>
		posCard({
			change_type: 'open_holding',
			proposed_values: { qty: 3, avg_price: 100 },
			current_values: null,
			position_id: null,
			...over
		});

	it('요청 값에 통화가 있으면 그대로(신규 매수 USD)', async () => {
		repo.listQueueProposals.mockResolvedValue(
			page([buy({ proposed_values: { qty: 3, avg_price: 100, currency: 'USD' } })])
		);
		expect((await call()).queue.items[0].currency).toBe('USD');
	});

	it('요청에 통화가 없으면 같은 종목 포지션의 통화(USD)를 쓴다', async () => {
		repo.listPositionCards.mockResolvedValue({
			data: [{ id: 'p9', instrument_id: 'i1', status: 'planned', currency: 'USD', qty: null }],
			error: null
		});
		repo.listQueueProposals.mockResolvedValue(page([buy({})]));
		expect((await call()).queue.items[0].currency).toBe('USD');
	});

	it('통화를 알 수 없으면 KRW가 아니라 null(화면은 기호 없이 숫자만)', async () => {
		repo.listQueueProposals.mockResolvedValue(page([buy({})]));
		expect((await call()).queue.items[0].currency).toBeNull();
	});
});
