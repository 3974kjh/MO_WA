import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
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
	queueNote: null,
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
		// 차트를 지어내지 않는다. 빈 상태 기호 아이콘(Lucide, icons.md §2 #23)은 차트가 아니므로 뺀다
		expect(container.querySelector('svg:not(.lucide)')).toBeNull();
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

	it('큐 금액: USD는 달러 표기, 통화를 모르면 원 표기 없이 숫자만', () => {
		const item = (id: string, currency: 'KRW' | 'USD' | null) => ({
			kind: 'position',
			id,
			status: 'pending',
			change_type: 'open_holding',
			name: '종목' + id,
			ticker: id,
			clause_ref: null,
			currency,
			changes: [{ field: 'avg_price', from: null, to: 12.5 }],
			created_at: '2026-11-20T00:00:00Z'
		});
		const { container } = render(Page, {
			data: {
				...empty,
				queue: { items: [item('u', 'USD'), item('n', null)], total: 2, pendingCount: 2 }
			} as never
		});
		const rows = container.querySelectorAll('[data-testid="home-queue"] li');
		const usd = rows[0].textContent ?? '';
		const unknown = rows[1].textContent ?? '';
		expect(usd).toContain('$');
		expect(usd).not.toContain('원');
		expect(unknown).toContain('12.5');
		expect(unknown).not.toContain('원');
		expect(unknown).not.toContain('$');
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
							kind: 'position',
							id: 'q1',
							status: 'pending',
							change_type: 'set_qty_avg',
							name: '테스트종목',
							ticker: 'TST',
							clause_ref: null,
							currency: 'KRW',
							changes: [{ field: 'qty', from: 1, to: 2 }],
							created_at: '2026-11-20T00:00:00Z'
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

	it('오늘 요약 lead는 daily_brief만: 주간 리포트만 있으면 요약은 빈 상태(최근 브리핑 목록에는 남는다)', async () => {
		const { container } = render(Page, {
			data: {
				...empty,
				recentBriefings: [
					{
						id: 'w1',
						kind: 'weekly_report',
						slug: 'weekly',
						headline: '주간 리포트 제목',
						title: 'w',
						report_date: '2026-11-22',
						tags: ['주간태그'],
						kospi_change_pct: null
					}
				]
			} as never
		});
		const summary = container.querySelector('.summary')!;
		expect(summary.querySelector('[data-testid="home-headline"]')).toBeNull();
		expect(text(summary)).toContain('아직 브리핑이 없어요');
		expect(text(summary)).not.toContain('주간 리포트 제목');
		expect(text(summary)).not.toContain('주간태그');
		expect(text(summary)).not.toContain('브리핑 전체 읽기');
		expect(text(summary)).not.toContain('브리핑 목록 보기');
		expect(text(container.querySelector('[data-testid="home-recent"]')!)).toContain(
			'주간 리포트 제목'
		);
	});

	it('달러 비중 타일: 환율과 기준 시각(KST)을 함께, 기준 시각이 없으면 지어내지 않는다(R-VAL-P17)', async () => {
		const held = {
			id: 'p1',
			instrument_id: 'i1',
			name: '테스트종목',
			ticker: 'TST',
			status: 'holding',
			currency: 'KRW',
			qty: 2,
			avg_price: 100,
			trigger_price: null,
			trigger_direction: null,
			watch_only: false,
			price: 102,
			price_as_of: '2026-11-20',
			value_krw: 204
		};
		const withFx = (usdkrw: number | null, usdkrwAsOf: string | null) =>
			render(Page, {
				data: {
					...empty,
					positions: [held],
					valuation: { totalKrw: 204, usdkrw, usdkrwAsOf, positions: [] }
				} as never
			});

		const a = withFx(1380.5, '2026-11-20T06:30:00Z');
		expect(text(a.container)).toContain('환율 1,380.50원 · 11/20 15:30 KST 기준');
		a.unmount();

		const d = withFx(1380.5, '2026-11-20');
		expect(text(d.container)).toContain('환율 1,380.50원 · 11/20 기준');
		expect(text(d.container)).not.toMatch(/11\/20 \d{2}:\d{2}/);
		expect(text(d.container)).not.toContain('KST 기준');
		d.unmount();

		const e = withFx(1380.5, '2026-01-05');
		expect(text(e.container)).toContain('환율 1,380.50원 · 01/05 기준');
		e.unmount();

		const n = withFx(1380.5, '2026-11-20T00:00:00');
		expect(text(n.container)).toContain('환율 1,380.50원 · 11/20 기준');
		expect(text(n.container)).not.toMatch(/11\/20 \d{2}:\d{2}/);
		n.unmount();

		const g = withFx(1380.5, 'garbage');
		expect(text(g.container)).toContain('환율 1,380.50원 · 기준 시각 —');
		g.unmount();

		const b = withFx(1380.5, null);
		expect(text(b.container)).toContain('환율 1,380.50원 · 기준 시각 —');
		expect(text(b.container)).not.toMatch(/1,380\.50원 · \d+\/\d+/);
		b.unmount();

		const c = withFx(null, null);
		expect(text(c.container)).toContain('환율 기록 없음');
	});

	it('총 평가금액 안내: 환율이 없어 평가금액이 빠진 달러 종목도 "평가금액 없는 N종목"으로 센다', async () => {
		const pos = (over: Record<string, unknown>) => ({
			instrument_id: 'i',
			currency: 'KRW',
			qty: 1,
			avg_price: 100,
			trigger_price: null,
			trigger_direction: null,
			watch_only: false,
			price: 102,
			price_as_of: '2026-11-20',
			value_krw: 102,
			status: 'holding',
			...over
		});
		const { container } = render(Page, {
			data: {
				...empty,
				positions: [
					pos({ id: 'a', name: '원화종목', ticker: 'KRW1' }),
					pos({ id: 'b', name: '달러종목', ticker: 'USD1', currency: 'USD', value_krw: null })
				]
			} as never
		});
		const t = text(container.querySelector('[data-testid="home-tiles"]')!);
		expect(t).toContain('평가금액 없는 1종목 제외');
		expect(t).not.toContain('가격 없는');
	});

	it('감시 카드는 감시 가격이 있거나 관심만인 종목만 보인다(일반 보유는 제외)', async () => {
		const pos = (over: Record<string, unknown>) => ({
			instrument_id: 'i',
			currency: 'KRW',
			qty: 1,
			avg_price: 100,
			trigger_price: null,
			trigger_direction: null,
			watch_only: false,
			price: 102,
			price_as_of: '2026-11-20',
			value_krw: 102,
			status: 'holding',
			...over
		});
		const { container } = render(Page, {
			data: {
				...empty,
				positions: [
					pos({ id: 'a', name: '일반보유', ticker: 'ORD' }),
					pos({
						id: 'b',
						name: '가격있음',
						ticker: 'TRG',
						trigger_price: 100,
						trigger_direction: 'below'
					}),
					pos({ id: 'c', name: '관심전용', ticker: 'WCH', watch_only: true, status: 'planned' })
				]
			} as never
		});
		const card = container.querySelector('[data-testid="home-triggers"]')!;
		const t = text(card);
		expect(t).not.toContain('일반보유');
		expect(t).toContain('가격있음');
		expect(t).toContain('관심전용');
		expect(t.match(/관심만/g)?.length).toBe(1);
		expect(card.querySelectorAll('li').length).toBe(2);
	});

	it('감시 필터 경계: 현재가 없는 감시 종목은 남고, 감시가 없는 planned 행은 제외된다', async () => {
		const pos = (over: Record<string, unknown>) => ({
			instrument_id: 'i',
			currency: 'KRW',
			qty: 1,
			avg_price: 100,
			trigger_price: null,
			trigger_direction: null,
			watch_only: false,
			price: 102,
			price_as_of: '2026-11-20',
			value_krw: 102,
			status: 'holding',
			...over
		});
		const { container } = render(Page, {
			data: {
				...empty,
				positions: [
					pos({
						id: 'u',
						name: '현재가없음',
						ticker: 'UNP',
						trigger_price: 100,
						trigger_direction: 'below',
						price: null,
						price_as_of: null,
						value_krw: null
					}),
					pos({ id: 'p', name: '계획무감시', ticker: 'PLN', status: 'planned' })
				]
			} as never
		});
		const card = container.querySelector('[data-testid="home-triggers"]')!;
		const t = text(card);
		expect(t).toContain('현재가없음');
		expect(t).toContain('현재가 없음');
		expect(t).toContain('가격 없음');
		expect(t).not.toContain('계획무감시');
		expect(card.querySelectorAll('li').length).toBe(1);
	});

	it('감시 대상이 하나도 없으면(일반 보유뿐) 감시 카드는 빈 상태', async () => {
		const { container } = render(Page, {
			data: {
				...empty,
				positions: [
					{
						id: 'a',
						instrument_id: 'i',
						name: '일반보유',
						ticker: 'ORD',
						status: 'holding',
						currency: 'KRW',
						qty: 1,
						avg_price: 100,
						trigger_price: null,
						trigger_direction: null,
						watch_only: false,
						price: 102,
						price_as_of: '2026-11-20',
						value_krw: 102
					}
				]
			} as never
		});
		expect(container.querySelector('[data-testid="home-triggers"]')).toBeNull();
		expect(text(container)).toContain('감시 중인 종목이 없어요');
	});

	it('≥640에서 지표·키워드를 접으면 높이가 줄고, 다시 누르면 펼쳐진다 (M1)', async () => {
		await page.viewport(768, 1024);
		const { container } = render(Page, {
			data: {
				...empty,
				tickers: {
					kospi: { key: 'kospi', value: 2500, change_pct: -1, as_of: '2026-11-20' },
					kosdaq: { key: 'kosdaq', value: 800, change_pct: 1, as_of: '2026-11-20' },
					usdkrw: { key: 'usdkrw', value: 1400, change_pct: 0, as_of: '2026-11-20' },
					ust10y: { key: 'ust10y', value: 4.2, change_pct: null, as_of: '2026-11-20' }
				},
				recentBriefings: [
					{
						id: 'r1',
						kind: 'daily_brief',
						slug: 'daily',
						headline: '금리 동결',
						title: '데일리',
						report_date: '2026-11-20',
						tags: ['금리'],
						kospi_change_pct: null
					}
				]
			} as never
		});
		const details = container.querySelector<HTMLDetailsElement>('details.more')!;
		await expect.poll(() => details.open && !details.hasAttribute('data-ssr')).toBe(true);
		const openH = details.getBoundingClientRect().height;
		expect(openH).toBeGreaterThan(40);
		details.querySelector('summary')!.click();
		await expect.poll(() => details.open).toBe(false);
		const closedH = details.getBoundingClientRect().height;
		expect(closedH).toBeLessThan(openH);
		details.querySelector('summary')!.click();
		await expect.poll(() => details.open).toBe(true);
		expect(details.getBoundingClientRect().height).toBeGreaterThan(closedH);
	});
});

describe('홈 확인 대기: 투자 원칙 개정 요청 + 일부 실패 (FE-07 후속)', () => {
	const posItem = {
		kind: 'position',
		id: 'q1',
		status: 'pending',
		change_type: 'set_qty_avg',
		name: '테스트종목',
		ticker: 'TST',
		clause_ref: null,
		currency: 'KRW',
		changes: [],
		created_at: '2026-11-19T00:00:00Z'
	};
	const prinItem = (over: Record<string, unknown> = {}) => ({
		kind: 'principle',
		id: 'r1',
		status: 'on_hold',
		change_type: 'principle',
		name: null,
		ticker: null,
		clause_ref: '2-1',
		currency: 'KRW',
		changes: [],
		created_at: '2026-11-20T00:00:00Z',
		...over
	});
	const pill = (c: Element) => c.querySelector('[aria-label^="확인 대기"]');

	it('원칙 요청은 조항·"투자 원칙 개정"·상태 배지로, 포지션과 한 목록에', async () => {
		const { container } = render(Page, {
			data: {
				...empty,
				queue: {
					items: [prinItem(), prinItem({ id: 'r2', clause_ref: null, status: 'pending' }), posItem],
					total: 3,
					pendingCount: 2
				}
			} as never
		});
		const list = container.querySelector('[data-testid="home-queue"]')!;
		const rows = [...list.querySelectorAll('li')];
		expect(rows.map((r) => r.getAttribute('data-kind'))).toEqual([
			'principle',
			'principle',
			'position'
		]);
		expect(text(rows[0])).toContain('2-1');
		expect(text(rows[0])).toContain('투자 원칙 개정');
		expect(text(rows[0])).toContain('보류');
		expect(text(rows[1].querySelector('b')!)).toBe('투자 원칙');
		expect(text(rows[1])).toContain('대기');
		expect(text(list)).not.toContain('principle');
		expect(text(list)).not.toContain('이름 없는 종목');
		expect(pill(container)?.getAttribute('aria-label')).toBe('확인 대기 2건');
		expect(container.querySelector('[data-testid="home-queue-note"]')).toBeNull();
	});

	it('원칙만 못 읽으면 포지션 항목 + 안내(카드 오류 아님)', async () => {
		const note = '투자 원칙 개정 요청을 불러오지 못했어요. 목록과 건수가 실제보다 적을 수 있어요.';
		const { container } = render(Page, {
			data: {
				...empty,
				queue: { items: [posItem], total: 1, pendingCount: null },
				queueNote: note
			} as never
		});
		expect(text(container.querySelector('[data-testid="home-queue"]')!)).toContain('테스트종목');
		expect(text(container.querySelector('[data-testid="home-queue-note"]')!)).toBe(note);
		expect(text(container)).not.toContain('데이터를 불러오지 못했어요');
		expect(pill(container)).toBeNull();
	});

	it('한쪽 실패 + 읽힌 항목 0건이면 "없어요" 대신 안내만', async () => {
		const { container } = render(Page, {
			data: { ...empty, queueNote: '보유 기록 변경 요청을 불러오지 못했어요.' } as never
		});
		expect(container.querySelector('[data-testid="home-queue-note"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="home-queue"]')).toBeNull();
		expect(text(container)).not.toContain('확인할 요청이 없어요');
	});

	it('둘 다 실패면 카드 오류 상태만', async () => {
		const { container } = render(Page, {
			data: {
				...empty,
				queue: { items: [], total: 0, pendingCount: null },
				queueError: '정보를 불러오지 못했어요.'
			} as never
		});
		expect(text(container)).toContain('데이터를 불러오지 못했어요');
		expect(container.querySelector('[data-testid="home-queue"]')).toBeNull();
		expect(container.querySelector('[data-testid="home-queue-note"]')).toBeNull();
		expect(pill(container)).toBeNull();
	});

	it('둘 다 0건이면 빈 상태, 건수 pill 없음', async () => {
		const { container } = render(Page, { data: empty as never });
		expect(text(container)).toContain('확인할 요청이 없어요');
		expect(pill(container)).toBeNull();
		expect(container.querySelector('[data-testid="home-queue-note"]')).toBeNull();
	});
	it('같은 태그가 두 번 든 브리핑도 화면이 멈추지 않고 태그는 한 번씩(값-키 each)', () => {
		const { container } = render(Page, {
			data: {
				...empty,
				recentBriefings: [
					{
						id: 'r1',
						kind: 'daily_brief',
						slug: 'daily',
						headline: '금리 동결',
						title: '데일리',
						report_date: '2026-11-20',
						tags: ['금리', '환율', '금리'],
						kospi_change_pct: null
					}
				]
			} as never
		});
		const tags = [...container.querySelectorAll('.tags')].map(
			(el) => el.textContent?.match(/금리/g)?.length ?? 0
		);
		expect(tags.length).toBeGreaterThan(0);
		for (const n of tags) expect(n).toBe(1);
		expect(text(container)).toContain('환율');
	});
});
