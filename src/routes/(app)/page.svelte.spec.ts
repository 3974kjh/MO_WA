import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

const empty = {
	user: { id: 'u1', email: null },
	valuation: null,
	valuationError: null,
	positions: [],
	positionsError: null,
	kospi: null,
	tickers: { kospi: null, kosdaq: null, usdkrw: null, ust10y: null },
	tickersError: null,
	queue: { items: [], total: 0, pendingCount: 0 },
	queueError: null,
	kospiSeries: [],
	kospiSeriesError: null,
	recentBriefings: [],
	briefingsError: null
};

const text = (c: Element) => c.textContent ?? '';

describe('홈 대시보드 렌더 (FE-03)', () => {
	it('데이터가 없으면 카드마다 빈 상태만 보이고 숫자를 지어내지 않는다', async () => {
		const { container } = render(Page, { data: empty as never });
		const t = text(container);
		expect(container.querySelector('[data-testid="home-dashboard"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="mo-wa-authenticated-landing"]')).toBeNull();
		for (const msg of [
			'확인할 요청이 없어요',
			'아직 브리핑이 없어요',
			'아직 보유 종목이 없어요',
			'비중을 낼 평가금액이 없어요',
			'추이를 그릴 기록이 아직 부족해요',
			'감시 중인 종목이 없어요',
			'아직 기록된 지표가 없어요'
		]) {
			expect(t, msg).toContain(msg);
		}
		expect(t).not.toMatch(/4,869|P-0412|NAVER|로보티즈|예시/);
		expect(container.querySelector('svg')).toBeNull();
	});

	it('오류면 일반 오류 상태(원문 없음)', async () => {
		const err = '정보를 불러오지 못했어요.';
		const { container } = render(Page, {
			data: {
				...empty,
				valuationError: err,
				positionsError: err,
				queueError: err,
				kospiSeriesError: err,
				briefingsError: err,
				tickersError: err
			} as never
		});
		expect(container.querySelectorAll('[role="alert"], .state').length).toBeGreaterThan(0);
		expect(text(container)).toContain('데이터를 불러오지 못했어요');
	});

	it('실제 load 값으로 큐·감시 가격·브리핑을 그린다(확인 대기가 DOM에서 먼저)', async () => {
		const { container } = render(Page, {
			data: {
				...empty,
				kospi: { key: 'kospi', value: 2500, change_pct: -1, as_of: '2026-11-20' },
				tickers: {
					kospi: { key: 'kospi', value: 2500, change_pct: -1, as_of: '2026-11-20' },
					kosdaq: null,
					usdkrw: null,
					ust10y: null
				},
				queue: {
					items: [
						{
							id: 'q1',
							status: 'pending',
							change_type: 'set_qty_avg',
							name: '테스트종목',
							ticker: 'TST',
							currency: 'KRW',
							changes: [{ field: 'qty', from: 1, to: 2 }]
						}
					],
					total: 1,
					pendingCount: 1
				},
				positions: [
					{
						id: 'p1',
						instrument_id: 'i1',
						name: '테스트종목',
						ticker: 'TST',
						status: 'holding',
						currency: 'KRW',
						qty: 2,
						avg_price: 100,
						trigger_price: 100,
						trigger_direction: 'below',
						watch_only: false,
						price: 102,
						price_as_of: '2026-11-20',
						value_krw: 204
					}
				],
				valuation: { totalKrw: 204, usdkrw: null, usdkrwAsOf: null, positions: [] },
				recentBriefings: [
					{
						id: 'r1',
						kind: 'daily_brief',
						slug: 'daily',
						headline: '  ',
						title: 't',
						report_date: '2026-11-20',
						tags: ['태그'],
						kospi_change_pct: null
					}
				]
			} as never
		});
		const t = text(container);
		expect(t).toContain('수량·평균 단가 변경');
		expect(t).toContain('수량 1주 → 2주');
		expect(t).toContain('확인 대기');
		expect(t).not.toContain('set_qty_avg');
		expect(t).toContain('3% 이내');
		expect(t).toContain('+2.00%');
		expect(t).toContain('이하');
		expect(t).toContain('headline 미입력');
		expect(t).toContain('11월 20일(금) 브리핑 전체 읽기');
		const queue = container.querySelector('[data-testid="home-queue"]')!;
		const headline = container.querySelector('[data-testid="home-headline"]')!;
		expect(queue.compareDocumentPosition(headline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
		expect(links).toContain('/portfolio#queue');
		expect(links).toContain('/briefings/2026-11-20');
	});
});
