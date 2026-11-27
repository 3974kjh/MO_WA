/**
 * FE-07 포트폴리오 load·화면 소스 계약.
 * - 로그인 load는 실제 repo 로더(BE-11/19)를 부르고 픽스처를 쓰지 않는다.
 * - 화면 소스에 시안 샘플 수치·픽스처·'충돌'·다크 변형 유틸리티·왼쪽 색 세로선이 없다.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

type AnyLoader = (...args: unknown[]) => Promise<unknown>;

const repo = vi.hoisted(() => ({
	ATTENTION_NEEDED_LIMIT: 50,
	forUser: vi.fn(() => ({})),
	listQueueProposals: vi.fn(),
	listPositionCards: vi.fn(),
	listAttentionNeeded: vi.fn(),
	listProposalHistory: vi.fn(),
	listInstrumentMeta: vi.fn(),
	listPrincipleQueue: vi.fn(),
	listPrincipleHistory: vi.fn(),
	listPortfolioPositionDetails: vi.fn<AnyLoader>(async () => ({ data: [], error: null })),
	listOpenProposalRefs: vi.fn<AnyLoader>(async () => ({
		data: { positions: [], holdCount: 0 },
		error: null
	})),
	loadDashboardValuation: vi.fn<AnyLoader>(async () => ({
		data: { totalKrw: null, usdkrw: null, usdkrwAsOf: null, positions: [] },
		error: null
	}))
}));
vi.mock('$lib/server/repo', () => repo);

import { load } from './+page.server';

const card = (over: Record<string, unknown>) => ({
	id: 'q1',
	display_id: 'P-0031',
	change_type: 'set_qty_avg',
	status: 'pending',
	calc_note: null,
	reason_md: null,
	decision_note: null,
	proposed_by_type: 'bot',
	proposer_name: '투자 관리 봇',
	evidence_chips: [],
	attention_started_at: null,
	acknowledged_at: null,
	base_version: 1,
	approval_version: 2,
	would_conflict: true,
	proposed_values: { qty: 5, avg_price: 77 },
	applied_values: null,
	current_values: { qty: 4, avg_price: 70, currency: 'KRW' },
	position_id: 'p1',
	instrument_id: null,
	created_at: '2026-11-21T00:00:00Z',
	expires_at: '2026-11-28T00:00:00Z',
	held_at: null,
	decided_at: null,
	...over
});

const position = {
	id: 'p1',
	instrument_id: 'i1',
	status: 'holding',
	currency: 'KRW',
	qty: 6,
	avg_price: 72,
	approval_version: 2,
	trigger_price: 50,
	trigger_direction: 'below',
	watch_only: false,
	latest_price: null,
	latest_price_as_of: null,
	latest_price_currency: null
};

const call = (search = '') =>
	(load as unknown as (e: unknown) => Promise<Record<string, unknown>>)({
		locals: { user: { id: 'u1' }, supabase: {} },
		url: new URL(`http://localhost/portfolio${search}`),
		parent: async () => ({})
	});

const principle = (over: Record<string, unknown>) => ({
	id: 'r1',
	display_id: 'R-0009',
	status: 'pending',
	clause_ref: '2-1',
	body_preview: '원칙 본문',
	body_truncated: false,
	reason_md: '원칙 이유',
	decision_note: null,
	proposed_by_type: 'bot',
	proposer_name: '투자 관리 봇',
	evidence_chips: [],
	attention_started_at: null,
	acknowledged_at: null,
	base_version: 4,
	created_at: '2026-11-20T00:00:00Z',
	held_at: null,
	decided_at: null,
	...over
});

const emptyPage = { data: { items: [], total: 0 }, error: null };

afterEach(() => vi.clearAllMocks());

describe('FE-07 portfolio load', () => {
	it('원칙 개정 요청(R-)을 확인 대기·지난 내역·확인 필요에 같이 싣는다', async () => {
		repo.listQueueProposals.mockResolvedValue({
			data: { items: [card({ created_at: '2026-11-19T00:00:00Z' })], total: 30 },
			error: null
		});
		repo.listPositionCards.mockResolvedValue({ data: [position], error: null });
		repo.listAttentionNeeded.mockResolvedValue({
			data: {
				positions: [],
				principles: [
					principle({
						id: 'ra',
						display_id: 'R-0008',
						status: 'expired',
						clause_ref: '4-1',
						body_preview: '확인 필요 원칙 본문',
						body_truncated: true,
						attention_started_at: '2026-11-21T00:00:00Z'
					})
				]
			},
			error: null
		});
		repo.listProposalHistory.mockResolvedValue(emptyPage);
		repo.listPrincipleQueue.mockResolvedValue({
			data: { items: [principle({})], total: 2 },
			error: null
		});
		repo.listPrincipleHistory.mockResolvedValue({
			data: {
				items: [principle({ id: 'rh', status: 'rejected', decided_at: '2026-11-21T02:00:00Z' })],
				total: 1
			},
			error: null
		});
		repo.listInstrumentMeta.mockResolvedValue({ data: [], error: null });

		const out = (await call()) as {
			queue: { items: Array<Record<string, unknown>>; total: number };
			history: { items: Array<Record<string, unknown>>; total: number };
			attentionNeeded: Array<Record<string, unknown>>;
		};
		expect(repo.listPrincipleQueue).toHaveBeenCalledWith(expect.anything(), {
			page: 1,
			pageSize: 20,
			offset: 0,
			limit: 20
		});
		expect(repo.listPrincipleHistory).toHaveBeenCalledTimes(1);
		// 최신순 병합: 원칙(11-20) → 포지션(11-19)
		expect(out.queue.items.map((i) => [i.kind, i.display_id])).toEqual([
			['principle', 'R-0009'],
			['position', 'P-0031']
		]);
		expect(out.queue.total).toBe(32);
		expect(out.queue.items[0]).toMatchObject({
			change_type: 'principle',
			clause_ref: '2-1',
			body_preview: '원칙 본문',
			reason: '원칙 이유',
			approval_version: null
		});
		expect(out.history.items).toMatchObject([{ id: 'rh', kind: 'principle', status: 'rejected' }]);
		// 확인 필요 원칙 카드도 principleToQueueItem: 본문 미리보기·잘림·조항이 다른 목록과 같다
		expect(out.attentionNeeded).toMatchObject([
			{
				id: 'ra',
				kind: 'principle',
				display_id: 'R-0008',
				status: 'expired',
				change_type: 'principle',
				clause_ref: '4-1',
				body_preview: '확인 필요 원칙 본문',
				body_truncated: true,
				reason: '원칙 이유'
			}
		]);
	});

	it('원칙 목록 오류는 publicListError 문구만 보인다', async () => {
		repo.listQueueProposals.mockResolvedValue(emptyPage);
		repo.listPositionCards.mockResolvedValue({ data: [], error: null });
		repo.listAttentionNeeded.mockResolvedValue({
			data: { positions: [], principles: [] },
			error: null
		});
		repo.listProposalHistory.mockResolvedValue(emptyPage);
		const raw = new Error('permission denied for table principle_proposals');
		repo.listPrincipleQueue.mockResolvedValue({ data: { items: [], total: 0 }, error: raw });
		repo.listPrincipleHistory.mockResolvedValue({ data: { items: [], total: 0 }, error: raw });
		repo.listInstrumentMeta.mockResolvedValue({ data: [], error: null });
		const out = (await call()) as Record<string, unknown>;
		expect(typeof out.queueError).toBe('string');
		expect(typeof out.historyError).toBe('string');
		expect(JSON.stringify(out)).not.toMatch(/permission denied|principle_proposals/);
	});

	it('실제 로더 4개 + 종목 정보를 부르고 화면용 항목으로 바꾼다', async () => {
		repo.listQueueProposals.mockResolvedValue({
			data: { items: [card({})], total: 1 },
			error: null
		});
		repo.listPositionCards.mockResolvedValue({ data: [position], error: null });
		repo.listAttentionNeeded.mockResolvedValue({
			data: {
				positions: [
					card({ id: 'a1', status: 'conflict', attention_started_at: '2026-11-21T00:00:00Z' })
				],
				principles: []
			},
			error: null
		});
		repo.listProposalHistory.mockResolvedValue({
			data: {
				items: [card({ id: 'h1', status: 'approved', applied_values: { qty: 4, avg_price: 77 } })],
				total: 1
			},
			error: null
		});
		repo.listInstrumentMeta.mockResolvedValue({
			data: [{ id: 'i1', name: '실데이터종목', ticker: 'RD', asset_type: 'stock' }],
			error: null
		});
		repo.listPrincipleQueue.mockResolvedValue(emptyPage);
		repo.listPrincipleHistory.mockResolvedValue(emptyPage);

		const out = (await call()) as {
			queue: { items: Array<Record<string, unknown>>; total: number };
			history: { items: Array<Record<string, unknown>> };
			attentionNeeded: Array<Record<string, unknown>>;
			holdings: Array<Record<string, unknown>>;
		};
		expect(repo.listQueueProposals).toHaveBeenCalledTimes(1);
		expect(repo.listAttentionNeeded).toHaveBeenCalledTimes(1);
		expect(repo.listProposalHistory).toHaveBeenCalledWith(expect.anything(), {
			page: 1,
			pageSize: 20,
			offset: 0,
			limit: 20
		});
		expect(new Set(repo.listInstrumentMeta.mock.calls[0][1] as string[])).toEqual(new Set(['i1']));
		expect(out.queue.items[0]).toMatchObject({
			name: '실데이터종목',
			base_version: 1,
			approval_version: 2,
			live_values: { qty: 6, avg_price: 72 }
		});
		expect(out.attentionNeeded.map((i) => i.id)).toEqual(['a1']);
		expect(out.history.items[0]).toMatchObject({ id: 'h1', status: 'approved' });
		expect(out.holdings).toEqual([
			{
				id: 'p1',
				name: '실데이터종목',
				status: 'holding',
				currency: 'KRW',
				qty: 6,
				avg_price: 72,
				approval_version: 2,
				asset_type: 'stock'
			}
		]);
		// 기록 수정 대상(holdings)에는 감시 가격 등 봇 전용 값을 싣지 않는다.
		// FE-05 표(portfolio.rows)는 손익분기 가격·감시 가격·관심만을 읽기 전용으로 보인다(입력란 없음은 화면 spec).
		expect(JSON.stringify(out.holdings)).not.toMatch(/trigger_price|watch_only|breakeven/);
	});

	it('FE-05: 표 행(보유·매수 계획·보유 종료) + 평가금액·환율·행 배지·보류 건수, 원문 오류 없음', async () => {
		repo.listQueueProposals.mockResolvedValue(emptyPage);
		repo.listPositionCards.mockResolvedValue({
			data: [{ ...position, latest_price: 80, latest_price_currency: 'KRW' }],
			error: null
		});
		repo.listAttentionNeeded.mockResolvedValue({
			data: { positions: [], principles: [] },
			error: null
		});
		repo.listProposalHistory.mockResolvedValue(emptyPage);
		repo.listPrincipleQueue.mockResolvedValue(emptyPage);
		repo.listPrincipleHistory.mockResolvedValue(emptyPage);
		repo.listInstrumentMeta.mockResolvedValue({
			data: [
				{ id: 'i1', name: '실데이터종목', ticker: 'RD', asset_type: 'stock' },
				{ id: 'i9', name: '끝난종목', ticker: 'ZZ', asset_type: 'stock' }
			],
			error: null
		});
		const d = {
			breakeven: 66,
			memo: '근거 한 줄',
			trigger_price: null,
			trigger_direction: 'below',
			watch_only: false,
			market: 'KRX'
		};
		repo.listPortfolioPositionDetails.mockResolvedValueOnce({
			data: [
				{
					...d,
					id: 'p1',
					instrument_id: 'i1',
					status: 'holding',
					currency: 'KRW',
					qty: 6,
					avg_price: 72
				},
				{
					...d,
					id: 'c9',
					instrument_id: 'i9',
					status: 'closed',
					currency: 'KRW',
					qty: 0,
					avg_price: 5
				}
			],
			error: null
		});
		repo.listOpenProposalRefs.mockResolvedValueOnce({
			data: { positions: [{ position_id: 'p1', status: 'pending' }], holdCount: 3 },
			error: null
		});
		repo.loadDashboardValuation.mockResolvedValueOnce({
			data: {
				totalKrw: 480,
				usdkrw: 1300,
				usdkrwAsOf: '2026-11-20',
				positions: [{ id: 'p1', valueKrw: 480 }]
			},
			error: null
		});
		const out = (await call()) as {
			portfolio: {
				rows: Array<Record<string, unknown>>;
				totalKrw: number;
				usdkrw: number;
				holdCount: number;
			};
			portfolioError: string | null;
			valuationError: string | null;
		};
		expect(out.portfolio.rows.map((r) => r.id)).toEqual(['p1', 'c9']);
		expect(out.portfolio.rows[0]).toMatchObject({
			name: '실데이터종목',
			price: 80,
			value_krw: 480,
			breakeven: 66,
			open_status: 'pending'
		});
		expect(out.portfolio.rows[1]).toMatchObject({ status: 'closed', value_krw: null });
		expect(out.portfolio).toMatchObject({ totalKrw: 480, usdkrw: 1300, holdCount: 3 });
		expect(out.portfolioError).toBeNull();
		expect(out.valuationError).toBeNull();
		// 환율 기준 시각 줄은 이번 범위가 아니다(F 묶음)
		expect(JSON.stringify(out.portfolio)).not.toContain('usdkrwAsOf');
	});

	it('FE-05: 표·valuation 오류는 일반 문구만', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const raw = new Error('permission denied for table positions');
		repo.listQueueProposals.mockResolvedValue(emptyPage);
		repo.listPositionCards.mockResolvedValue({ data: [], error: null });
		repo.listAttentionNeeded.mockResolvedValue({
			data: { positions: [], principles: [] },
			error: null
		});
		repo.listProposalHistory.mockResolvedValue(emptyPage);
		repo.listPrincipleQueue.mockResolvedValue(emptyPage);
		repo.listPrincipleHistory.mockResolvedValue(emptyPage);
		repo.listInstrumentMeta.mockResolvedValue({ data: [], error: null });
		repo.listPortfolioPositionDetails.mockResolvedValueOnce({ data: [], error: raw });
		repo.loadDashboardValuation.mockResolvedValueOnce({ data: null, error: raw });
		repo.listOpenProposalRefs.mockResolvedValueOnce({
			data: { positions: [], holdCount: 0 },
			error: raw
		});
		const out = (await call()) as Record<string, unknown>;
		expect(out.portfolioError).toBe('목록을 불러오지 못했어요.');
		expect(out.valuationError).toBe('정보를 불러오지 못했어요.');
		expect((out.portfolio as { holdCount: unknown }).holdCount).toBeNull();
		expect(JSON.stringify(out)).not.toMatch(/permission denied/);
		log.mockRestore();
	});

	describe('FE-05 Low-3: 열린 요청 참조 성공·실패 조합', () => {
		const raw = new Error('permission denied for table principle_proposals');
		const detailRow = {
			id: 'p1',
			instrument_id: 'i1',
			status: 'holding',
			currency: 'KRW',
			qty: 1,
			avg_price: 1,
			breakeven: null,
			memo: null,
			trigger_price: null,
			trigger_direction: 'below',
			watch_only: false,
			market: null
		};
		const cases: Array<{
			name: string;
			refs: Record<string, unknown>;
			holdCount: number | null;
			badge: string | null;
			logged: boolean;
		}> = [
			{
				name: '원칙만 실패: 포지션 배지 유지, 보류 건수 null',
				refs: {
					data: { positions: [{ position_id: 'p1', status: 'pending' }], holdCount: 1 },
					error: null,
					partialError: raw
				},
				holdCount: null,
				badge: 'pending',
				logged: true
			},
			{
				name: '포지션만 실패: 배지 없음, 보류 건수 null',
				refs: { data: { positions: [], holdCount: 2 }, error: null, partialError: raw },
				holdCount: null,
				badge: null,
				logged: true
			},
			{
				name: '둘 다 성공: 합계 그대로, 배지 유지',
				refs: {
					data: { positions: [{ position_id: 'p1', status: 'pending' }], holdCount: 3 },
					error: null,
					partialError: null
				},
				holdCount: 3,
				badge: 'pending',
				logged: false
			},
			{
				name: '둘 다 실패: 배지 없음, 보류 건수 null(기존)',
				refs: { data: { positions: [], holdCount: 0 }, error: raw },
				holdCount: null,
				badge: null,
				logged: false
			}
		];
		it.each(cases)('$name', async ({ refs, holdCount, badge, logged }) => {
			const log = vi.spyOn(console, 'error').mockImplementation(() => {});
			repo.listQueueProposals.mockResolvedValue(emptyPage);
			repo.listPositionCards.mockResolvedValue({ data: [], error: null });
			repo.listAttentionNeeded.mockResolvedValue({
				data: { positions: [], principles: [], total: 0 },
				error: null,
				countError: null
			});
			repo.listProposalHistory.mockResolvedValue(emptyPage);
			repo.listPrincipleQueue.mockResolvedValue(emptyPage);
			repo.listPrincipleHistory.mockResolvedValue(emptyPage);
			repo.listInstrumentMeta.mockResolvedValue({ data: [], error: null });
			repo.listPortfolioPositionDetails.mockResolvedValueOnce({ data: [detailRow], error: null });
			repo.listOpenProposalRefs.mockResolvedValueOnce(refs);
			const out = (await call()) as {
				portfolio: { rows: Array<Record<string, unknown>>; holdCount: number | null };
				portfolioError: string | null;
			};
			expect(out.portfolio.holdCount).toBe(holdCount);
			expect(out.portfolio.rows[0].open_status ?? null).toBe(badge);
			expect(out.portfolioError).toBeNull();
			expect(JSON.stringify(out)).not.toMatch(/permission denied|principle_proposals/);
			expect(
				log.mock.calls.some((c) => c[0] === '[portfolio.openRefs.partial] list load failed')
			).toBe(logged);
			log.mockRestore();
		});
	});

	it.each(['', '?page=3&pageSize=5', '?page=0&pageSize=1000', '?page=abc'])(
		'FE-07 Nit-4: 목록 4종은 항상 1쪽(page 1·size 20·offset 0·limit 20) — 쿼리 %j',
		async (search) => {
			repo.listQueueProposals.mockResolvedValue(emptyPage);
			repo.listPositionCards.mockResolvedValue({ data: [], error: null });
			repo.listAttentionNeeded.mockResolvedValue({
				data: { positions: [], principles: [], total: 0 },
				error: null,
				countError: null
			});
			repo.listProposalHistory.mockResolvedValue(emptyPage);
			repo.listPrincipleQueue.mockResolvedValue(emptyPage);
			repo.listPrincipleHistory.mockResolvedValue(emptyPage);
			repo.listInstrumentMeta.mockResolvedValue({ data: [], error: null });
			const first = { page: 1, pageSize: 20, offset: 0, limit: 20 };
			await call(search);
			for (const fn of [
				repo.listQueueProposals,
				repo.listProposalHistory,
				repo.listPrincipleQueue,
				repo.listPrincipleHistory
			]) {
				expect(fn).toHaveBeenCalledTimes(1);
				expect(fn.mock.calls[0][1]).toEqual(first);
			}
		}
	);

	it('비로그인은 401(레이아웃이 먼저 /login으로 보낸다)', async () => {
		await expect(
			(load as unknown as (e: unknown) => Promise<unknown>)({
				locals: { user: null, supabase: {} },
				url: new URL('http://localhost/portfolio')
			})
		).rejects.toMatchObject({ status: 401 });
	});
});

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const SOURCES = [
	'src/routes/(app)/portfolio/+page.svelte',
	'src/routes/(app)/portfolio/+page.server.ts',
	...readdirSync(join(root, 'src/lib/components/queue')).map(
		(f) => `src/lib/components/queue/${f}`
	),
	'src/lib/queue/proposals.ts',
	'src/lib/queue/view.ts',
	'src/lib/queue/deferred.ts'
];

describe('FE-07 화면 소스 계약', () => {
	it.each(SOURCES)('%s: 픽스처·시안 샘플·충돌·다크 변형·왼쪽 색 세로선 없음', (f) => {
		const src = read(f);
		expect(src).not.toMatch(/\$lib\/fixtures|\/fixtures\//);
		for (const sample of [
			'P-0412',
			'P-0411',
			'P-0410',
			'P-0409',
			'P-0408',
			'295.04',
			'290.98',
			'292.10',
			'100.42',
			'210,000',
			'202,438',
			'52,450',
			'138,191',
			'SGOV',
			'NAVER',
			'GOOGL',
			'알파벳',
			'(예시)',
			'시안 ·',
			'FE-07 시안'
		]) {
			expect(src, `${f} ${sample}`).not.toContain(sample);
		}
		expect(src).not.toContain('충돌');
		expect(src).not.toMatch(new RegExp('\\bdark' + ':'));
		expect(src).not.toMatch(/border-l-|border-left:\s*[34]px|inset\s+[34]px/);
	});

	it('page는 G-2 유예 전송(deferred)과 기존 폼 액션을 쓰고, 그대로 반영에는 overrides를 보내지 않는다', () => {
		const src = read('src/routes/(app)/portfolio/+page.svelte');
		expect(src).toMatch(/createDeferredSender/);
		for (const action of [
			'approve',
			'reject',
			'hold',
			'ack',
			'approvePrinciple',
			'decidePrinciple'
		]) {
			expect(src, action).toContain(`'${action}'`);
		}
		expect(src).toMatch(/postAction\('correct'/);
		expect(src).toMatch(/if \(overrides\) fields\.overrides = JSON\.stringify\(overrides\)/);
		expect(src).not.toMatch(/overrides:\s*''/);
	});

	it('고쳐서 반영 시트에 감시 가격·방향·손익분기·관심만 입력란이 없다', () => {
		const src = read('src/lib/components/queue/OverrideSheet.svelte');
		expect(src).not.toMatch(/bind:value=\{inputs\.(trigger|breakeven|watch)/);
		expect(src).not.toMatch(/inputs\.trigger_price|inputs\.breakeven|inputs\.watch_only/);
	});

	it('원칙 폼 액션은 기존 핸들러만 잇는다(새 쓰기 API 없음)', () => {
		const src = read('src/routes/(app)/portfolio/+page.server.ts');
		expect(src).toMatch(/approvePrinciple:[\s\S]*?handleApprovePrinciple\(/);
		expect(src).toMatch(/decidePrinciple:[\s\S]*?handleDecidePrinciple\(/);
		expect(src).not.toMatch(/\.rpc\(|fromRepo|\.from\(/);
	});

	it('/approvals는 /portfolio#queue로 보낸다(G-3)', () => {
		expect(read('src/routes/approvals/+page.ts')).toMatch(/\/portfolio#queue/);
	});
});

describe('FE-07 확인 필요: 실제 건수·전체 최신 상위 50건', () => {
	const setup = (att: Record<string, unknown>) => {
		repo.listQueueProposals.mockResolvedValue(emptyPage);
		repo.listPositionCards.mockResolvedValue({ data: [], error: null });
		repo.listAttentionNeeded.mockResolvedValue(att);
		repo.listProposalHistory.mockResolvedValue(emptyPage);
		repo.listPrincipleQueue.mockResolvedValue(emptyPage);
		repo.listPrincipleHistory.mockResolvedValue(emptyPage);
		repo.listInstrumentMeta.mockResolvedValue({ data: [], error: null });
	};
	const at = (i: number) => new Date(Date.UTC(2026, 10, 21) - i * 60000).toISOString();
	type Out = {
		attentionNeeded: Array<{ id: string; attention_started_at: string }>;
		attentionLimit: number;
		attentionShown: number;
		attentionTotal: number;
	};

	it('포지션 80 + 원칙 3 → 건수 83, 목록은 종류별 50 + 3을 합친 뒤 전체 최신 50건', async () => {
		const positions = Array.from({ length: 50 }, (_, i) =>
			card({ id: `a${i}`, status: 'conflict', attention_started_at: at(i * 2 + 10) })
		);
		const principles = [0, 1, 2].map((i) =>
			principle({ id: `r${i}`, status: 'expired', attention_started_at: at(i) })
		);
		setup({ data: { positions, principles, total: 83 }, countError: null, error: null });
		const out = (await call()) as unknown as Out;
		expect(out.attentionTotal).toBe(83);
		expect(out.attentionShown).toBe(50);
		// 화면 잘림 안내의 상한 숫자는 서버 상수 하나에서 온다(7c1c2b7 Nit-2).
		expect(out.attentionLimit).toBe(50);
		expect(out.attentionNeeded).toHaveLength(50);
		const ts = out.attentionNeeded.map((i) => Date.parse(i.attention_started_at));
		expect(ts).toEqual([...ts].sort((a, b) => b - a));
		// 원칙 3건이 맨 앞, 포지션은 가장 오래된 3건(a47~a49)이 잘려 나간다.
		expect(out.attentionNeeded.slice(0, 3).map((i) => i.id)).toEqual(['r0', 'r1', 'r2']);
		const ids = out.attentionNeeded.map((i) => i.id);
		expect(ids).not.toContain('a49');
		expect(ids).toContain('a46');
	});

	it('동점은 id 오름차순으로 고정한다', async () => {
		const same = at(0);
		setup({
			data: {
				positions: [card({ id: 'b', attention_started_at: same })],
				principles: [principle({ id: 'a', attention_started_at: same })],
				total: 2
			},
			countError: null,
			error: null
		});
		const out = (await call()) as unknown as Out;
		expect(out.attentionNeeded.map((i) => i.id)).toEqual(['a', 'b']);
	});

	it('건수 조회가 실패하면 목록은 그대로 두고 건수는 목록 길이, 오류는 로그만', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		setup({
			data: {
				positions: [card({ id: 'p', attention_started_at: at(0) })],
				principles: [],
				total: null
			},
			countError: new Error('count boom secret_tbl'),
			error: null
		});
		const out = (await call()) as unknown as Out;
		expect(out.attentionNeeded).toHaveLength(1);
		expect(out.attentionTotal).toBe(1);
		expect(spy).toHaveBeenCalledWith(
			expect.stringContaining('portfolio.attentionCount'),
			expect.anything()
		);
		expect(JSON.stringify(out)).not.toMatch(/count boom|secret_tbl/);
		spy.mockRestore();
	});

	it('화면 배지의 N은 목록 길이가 아니라 서버가 준 실제 건수에서 온다', () => {
		const src = read('src/routes/(app)/portfolio/+page.svelte');
		expect(src).toMatch(/<span class="count">\{attentionCount\}건<\/span>/);
		expect(src).toMatch(/data\.attentionTotal/);
		expect(src).not.toMatch(/class="count">\{attentionList\.length\}/);
	});
});
