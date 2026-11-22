import { existsSync, readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { isRedirect } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sectionFromPath } from '$lib/components/layout/nav';

const repoMock = vi.hoisted(() => ({
	forUser: vi.fn((_sb: unknown, ownerId: string) => ({
		actor: { kind: 'user', ownerId, botClientId: null }
	})),
	listPositionCards: vi.fn(
		async (): Promise<{ data: unknown[]; error: unknown }> => ({
			data: [],
			error: null
		})
	),
	loadDashboardValuation: vi.fn<
		(repo: unknown, cards?: unknown, fx?: unknown) => Promise<{ data: unknown; error: unknown }>
	>(async () => ({
		data: { totalKrw: 0, usdkrw: null, usdkrwAsOf: null, positions: [] },
		error: null
	})),
	getLatestIndicator: vi.fn(async (_repo: unknown, key: string) => ({
		data: key === 'kospi' ? { key: 'kospi', value: 1, change_pct: 0, as_of: '2026-11-21' } : null,
		error: null
	})),
	listBriefingsWithKospi: vi.fn(async () => ({
		data: { items: [], page: 1, pageSize: 5, total: 0, totalPages: 0 },
		error: null
	})),
	listQueueProposals: vi.fn(
		async (): Promise<{ data: unknown; error: unknown }> => ({
			data: { items: [], page: 1, pageSize: 5, total: 0, totalPages: 0 },
			error: null
		})
	),
	listPrincipleQueue: vi.fn(
		async (): Promise<{ data: unknown; error: unknown }> => ({
			data: { items: [], page: 1, pageSize: 5, total: 0, totalPages: 0 },
			error: null
		})
	),
	countPendingProposals: vi.fn(async () => ({ data: 0, error: null })),
	listIndicatorSeries: vi.fn(
		async (): Promise<{ data: unknown[]; error: unknown }> => ({
			data: [],
			error: null
		})
	),
	listInstrumentLabels: vi.fn(
		async (): Promise<{ data: unknown[]; error: unknown }> => ({
			data: [],
			error: null
		})
	)
}));
vi.mock('$lib/server/repo', () => repoMock);

import { load as homeLoad } from '../../routes/(app)/+page.server';
import { actions as logoutActions, load as logoutLoad } from '../../routes/logout/+page.server';

const root = resolvePath(__dirname, '../../..');
const read = (p: string) => readFileSync(resolvePath(root, p), 'utf8');

beforeEach(() => {
	vi.clearAllMocks();
});

/** redirect()가 던진 값을 잡아 {status, location}으로 돌려준다. */
async function catchRedirect(fn: () => unknown) {
	try {
		await fn();
	} catch (e) {
		if (isRedirect(e)) return { status: e.status, location: e.location };
		throw e;
	}
	throw new Error('redirect not thrown');
}

describe('홈(`/`)은 (app) 셸 안 (#12 Low 1, 사용자 결정 21:27)', () => {
	it('홈 페이지는 (app) 그룹에만 있고 루트에는 없다', () => {
		expect(existsSync(resolvePath(root, 'src/routes/(app)/+page.svelte'))).toBe(true);
		expect(existsSync(resolvePath(root, 'src/routes/(app)/+page.server.ts'))).toBe(true);
		expect(existsSync(resolvePath(root, 'src/routes/+page.svelte'))).toBe(false);
		expect(existsSync(resolvePath(root, 'src/routes/+page.server.ts'))).toBe(false);
	});
	it('/login은 셸 밖에 남는다', () => {
		expect(existsSync(resolvePath(root, 'src/routes/login/+page.svelte'))).toBe(true);
		expect(existsSync(resolvePath(root, 'src/routes/(app)/login'))).toBe(false);
	});
	it('`/`에서 홈 탭이 현재 섹션이다', () => {
		expect(sectionFromPath('/')).toBe('dashboard');
	});
	it('FE-03(I-8): 홈은 대시보드이고 HF-1 로고·로그아웃 랜딩은 없다', () => {
		const src = read('src/routes/(app)/+page.svelte');
		expect(src).toContain('data-testid="home-dashboard"');
		expect(src).not.toContain('mo-wa-authenticated-landing');
		expect(src).not.toContain('으로 로그인됨');
		expect(src).not.toContain('MoWaLogo');
		expect(src).not.toContain('LOGOUT_PATH');
		expect(src).not.toContain('min-h-dvh');
		expect(src).not.toMatch(/<main[\s>]/);
	});
	it('FE-03: 확인 대기 카드는 BE-19 attention 창(listAttentionNeeded)을 쓰지 않는다', () => {
		const src = read('src/routes/(app)/+page.server.ts');
		expect(src).not.toContain('listAttentionNeeded');
		expect(src).toContain('listQueueProposals');
		expect(src).toContain('countPendingProposals');
	});
	it('FE-03: 모바일 DOM 순서는 확인 대기 → 오늘 요약', () => {
		const src = read('src/routes/(app)/+page.svelte');
		const queue = src.indexOf('title="확인 대기"');
		const summary = src.indexOf('title="오늘 요약"');
		expect(queue).toBeGreaterThan(0);
		expect(summary).toBeGreaterThan(queue);
	});
	it('FE-03: 화면에 시안 샘플 값·fixture·샘플 안내 문구를 쓰지 않는다', () => {
		const files = [
			'src/routes/(app)/+page.svelte',
			'src/routes/(app)/+page.server.ts',
			'src/lib/dashboard/home.ts',
			'src/lib/dashboard/trigger.ts',
			'src/lib/components/dashboard/TriggerGauge.svelte'
		];
		for (const f of files) {
			const src = read(f);
			expect(src, f).not.toMatch(/\$lib\/fixtures|\/fixtures\//);
			for (const sample of [
				'4,869.96',
				'4869.96',
				'P-0412',
				'155,000',
				'210,000',
				'NAVER',
				'로보티즈',
				'예시',
				'시연용',
				'사이드카',
				'5,000'
			]) {
				expect(src, `${f} ${sample}`).not.toContain(sample);
			}
			expect(src, f).not.toMatch(/\bdark:/);
		}
	});
	it('로그인 안 한 `/` 요청은 /login으로 보낸다', async () => {
		const r = await catchRedirect(() =>
			homeLoad({ locals: { user: null }, parent: async () => ({}) } as never)
		);
		expect(r).toEqual({ status: 303, location: '/login' });
	});
	it('로그인한 `/`는 빈 데이터면 빈 배열·null만 돌려준다(샘플로 채우지 않음)', async () => {
		const data = await homeLoad({
			locals: {
				user: { id: 'u1', email: 'a@b.c', app_metadata: {} },
				supabase: {}
			},
			parent: async () => ({}),
			url: new URL('https://example.test/?page=9&pageSize=99')
		} as never);
		expect(data).toEqual({
			user: { id: 'u1', email: 'a@b.c' },
			valuation: { totalKrw: 0, usdkrw: null, usdkrwAsOf: null, positions: [] },
			valuationError: null,
			positions: [],
			positionsError: null,
			kospi: { key: 'kospi', value: 1, change_pct: 0, as_of: '2026-11-21' },
			tickers: {
				kospi: { key: 'kospi', value: 1, change_pct: 0, as_of: '2026-11-21' },
				kosdaq: null,
				usdkrw: null,
				ust10y: null
			},
			tickersError: null,
			queue: { items: [], total: 0, pendingCount: 0 },
			queueError: null,
			queueNote: null,
			kospiSeries: [],
			kospiSeriesError: null,
			recentBriefings: [],
			briefingsError: null
		});
		expect(data).not.toHaveProperty('actions');
		// L-8: URL의 page/pageSize를 따르지 않는다.
		expect(repoMock.listBriefingsWithKospi).toHaveBeenCalledWith(expect.anything(), {
			page: 1,
			pageSize: 5,
			offset: 0,
			limit: 5
		});
		expect(repoMock.listQueueProposals).toHaveBeenCalledWith(expect.anything(), {
			page: 1,
			pageSize: 5,
			offset: 0,
			limit: 5
		});
		expect(repoMock.listPrincipleQueue).toHaveBeenCalledWith(expect.anything(), {
			page: 1,
			pageSize: 5,
			offset: 0,
			limit: 5
		});
		expect(repoMock.listIndicatorSeries).toHaveBeenCalledWith(expect.anything(), 'kospi', 30);
		expect(repoMock.getLatestIndicator.mock.calls.map((c) => c[1])).toEqual([
			'kospi',
			'kosdaq',
			'usdkrw',
			'ust10y'
		]);
	});

	it('환율은 티커 조회에서 이미 읽은 usdkrw 결과를 valuation에 그대로 넘긴다(다시 읽지 않음)', async () => {
		const ind = (key: string, value: number) => ({
			data: { key, value, change_pct: 0, as_of: '2026-11-21' },
			error: null
		});
		const usdkrw = ind('usdkrw', 1400);
		repoMock.getLatestIndicator
			.mockResolvedValueOnce(ind('kospi', 1))
			.mockResolvedValueOnce(ind('kosdaq', 2))
			.mockResolvedValueOnce(usdkrw)
			.mockResolvedValueOnce(ind('ust10y', 4));
		repoMock.listPositionCards.mockResolvedValueOnce({ data: [], error: null });

		await homeLoad({
			locals: { user: { id: 'u1', email: null }, supabase: {} },
			parent: async () => ({})
		} as never);

		expect(repoMock.getLatestIndicator.mock.calls.filter((c) => c[1] === 'usdkrw')).toHaveLength(1);
		expect(repoMock.loadDashboardValuation).toHaveBeenCalledTimes(1);
		expect(repoMock.loadDashboardValuation.mock.calls[0][2]).toBe(usdkrw);
	});

	it('포지션·확인 대기·이름·평가금액을 합쳐 화면용 모양으로 돌려준다', async () => {
		repoMock.listPositionCards.mockResolvedValueOnce({
			data: [
				{
					id: 'pos1',
					instrument_id: 'ins1',
					status: 'holding',
					currency: 'USD',
					qty: 2,
					avg_price: 10,
					approval_version: 1,
					trigger_price: 9,
					trigger_direction: 'above',
					watch_only: false,
					latest_price: 12,
					latest_price_as_of: '2026-11-20',
					latest_price_currency: 'USD'
				}
			],
			error: null
		});
		repoMock.loadDashboardValuation.mockResolvedValueOnce({
			data: {
				totalKrw: 24000,
				usdkrw: 1000,
				usdkrwAsOf: '2026-11-20',
				positions: [{ id: 'pos1', valueKrw: 24000 }]
			},
			error: null
		});
		repoMock.listQueueProposals.mockResolvedValueOnce({
			data: {
				items: [
					{
						id: 'q1',
						status: 'pending',
						change_type: 'set_qty_avg',
						position_id: 'pos1',
						instrument_id: null,
						proposed_values: { qty: 3, avg_price: 11 },
						current_values: { qty: 2, avg_price: 10 },
						created_at: '2026-11-21T00:00:00Z'
					},
					{
						id: 'q2',
						status: 'on_hold',
						change_type: 'open_holding',
						position_id: null,
						instrument_id: 'ins2',
						proposed_values: { qty: 1, avg_price: 5000, currency: 'KRW' },
						current_values: null,
						created_at: '2026-11-20T00:00:00Z'
					}
				],
				page: 1,
				pageSize: 5,
				total: 7,
				totalPages: 2
			},
			error: null
		});
		repoMock.countPendingProposals.mockResolvedValueOnce({ data: 4, error: null });
		repoMock.listInstrumentLabels.mockResolvedValueOnce({
			data: [
				{ id: 'ins1', name: '종목 하나', ticker: 'AAA' },
				{ id: 'ins2', name: '종목 둘', ticker: 'BBB' }
			],
			error: null
		});
		repoMock.listIndicatorSeries.mockResolvedValueOnce({
			data: [
				{ as_of: '2026-11-19', value: 10 },
				{ as_of: '2026-11-20', value: 11 }
			],
			error: null
		});

		const data = (await homeLoad({
			locals: { user: { id: 'u1', email: null }, supabase: {} },
			parent: async () => ({})
		} as never)) as Record<string, unknown>;

		// 이미 읽은 포지션을 valuation에 넘겨 두 번 읽지 않는다.
		expect(repoMock.loadDashboardValuation).toHaveBeenCalledWith(
			expect.anything(),
			expect.arrayContaining([expect.objectContaining({ id: 'pos1' })]),
			expect.objectContaining({ error: null })
		);
		expect(repoMock.listInstrumentLabels).toHaveBeenCalledWith(expect.anything(), [
			'ins1',
			'ins1',
			'ins2'
		]);
		expect(data.positions).toEqual([
			{
				id: 'pos1',
				instrument_id: 'ins1',
				name: '종목 하나',
				ticker: 'AAA',
				status: 'holding',
				currency: 'USD',
				qty: 2,
				avg_price: 10,
				trigger_price: 9,
				trigger_direction: 'above',
				watch_only: false,
				price: 12,
				price_as_of: '2026-11-20',
				value_krw: 24000
			}
		]);
		expect(data.queue).toEqual({
			items: [
				{
					kind: 'position',
					id: 'q1',
					status: 'pending',
					change_type: 'set_qty_avg',
					name: '종목 하나',
					ticker: 'AAA',
					clause_ref: null,
					created_at: '2026-11-21T00:00:00Z',
					currency: 'USD',
					changes: [
						{ field: 'qty', from: 2, to: 3 },
						{ field: 'avg_price', from: 10, to: 11 }
					]
				},
				{
					kind: 'position',
					id: 'q2',
					status: 'on_hold',
					change_type: 'open_holding',
					name: '종목 둘',
					ticker: 'BBB',
					clause_ref: null,
					created_at: '2026-11-20T00:00:00Z',
					currency: 'KRW',
					changes: [
						{ field: 'qty', from: null, to: 1 },
						{ field: 'avg_price', from: null, to: 5000 }
					]
				}
			],
			total: 7,
			pendingCount: 4
		});
		expect(data.kospiSeries).toHaveLength(2);
	});

	it('load 오류는 일반 문구만, 원문은 싣지 않고 빈 값으로 둔다', async () => {
		const RAW = { code: '42501', message: 'permission denied for table secret_tbl' };
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		repoMock.listPositionCards.mockResolvedValueOnce({ data: [], error: RAW });
		repoMock.listQueueProposals.mockResolvedValueOnce({
			data: { items: [], page: 1, pageSize: 5, total: 0, totalPages: 0 },
			error: RAW
		});
		// 포지션·원칙 요청을 둘 다 못 읽을 때만 카드 전체 오류(한쪽만이면 queueNote — page.server.spec).
		repoMock.listPrincipleQueue.mockResolvedValueOnce({
			data: { items: [], page: 1, pageSize: 5, total: 0, totalPages: 0 },
			error: RAW
		});
		repoMock.listIndicatorSeries.mockResolvedValueOnce({ data: [], error: RAW });
		repoMock.getLatestIndicator.mockResolvedValueOnce({ data: null, error: RAW as never });
		const data = (await homeLoad({
			locals: { user: { id: 'u1', email: null }, supabase: {} },
			parent: async () => ({})
		} as never)) as Record<string, unknown>;
		const json = JSON.stringify(data);
		expect(json).not.toContain('permission denied');
		expect(json).not.toContain('42501');
		expect(data).toMatchObject({
			valuation: null,
			valuationError: '정보를 불러오지 못했어요.',
			positions: [],
			positionsError: '정보를 불러오지 못했어요.',
			queueError: '정보를 불러오지 못했어요.',
			kospiSeries: [],
			kospiSeriesError: '정보를 불러오지 못했어요.',
			tickersError: '정보를 불러오지 못했어요.',
			kospi: null
		});
		// 포지션을 못 읽으면 valuation을 다시 부르지 않는다.
		expect(repoMock.loadDashboardValuation).not.toHaveBeenCalled();
		log.mockRestore();
	});

	it('(app)/+page.server.ts has no logout action (use /logout)', () => {
		const src = read('src/routes/(app)/+page.server.ts');
		expect(src).not.toMatch(/export const actions/);
		expect(src).not.toMatch(/\blogout\b\s*:/);
		expect(src).not.toMatch(/signOut/);
	});
});

describe('전용 로그아웃 경로 (#12 Low 2)', () => {
	it('셸·더보기 모두 LOGOUT_PATH를 쓰고 `?/logout` 하드코딩이 없다', () => {
		for (const p of [
			'src/lib/components/layout/AppShell.svelte',
			'src/lib/components/layout/MoreSheet.svelte'
		]) {
			const src = read(p);
			expect(src, p).toContain('action={resolve(LOGOUT_PATH)}');
			expect(src, p).not.toContain('?/logout');
		}
	});
	it('기본 액션은 signOut 후 303 /login', async () => {
		const signOut = vi.fn(async () => ({ error: null }));
		const r = await catchRedirect(() =>
			logoutActions.default({ locals: { supabase: { auth: { signOut } } } } as never)
		);
		expect(signOut).toHaveBeenCalledTimes(1);
		expect(r).toEqual({ status: 303, location: '/login' });
	});
	it('GET /logout은 화면 없이 홈으로 돌려보낸다', async () => {
		const r = await catchRedirect(() => logoutLoad({} as never));
		expect(r).toEqual({ status: 303, location: '/' });
	});
});
