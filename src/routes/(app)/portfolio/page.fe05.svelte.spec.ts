/**
 * FE-05 포트폴리오 표·지표·비중 렌더(client). 값은 시안 샘플과 겹치지 않는 임의 숫자.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { flushSync } from 'svelte';

vi.mock('$app/navigation', () => ({
	beforeNavigate: () => {},
	invalidateAll: vi.fn(async () => {})
}));
vi.mock('$app/forms', () => ({ deserialize: (t: string) => JSON.parse(t) }));

import Page from './+page.svelte';
import { makeRow } from '../../../../tests/portfolio/testRow';
import { G4_NOTICE } from '$lib/portfolio/view';

const base = {
	title: '포트폴리오',
	pendingCount: 3,
	userEmail: null,
	queue: { items: [], total: 0 },
	queueError: null,
	history: { items: [], total: 0 },
	historyError: null,
	holdings: [],
	positionsError: null,
	portfolio: { rows: [], totalKrw: null, usdkrw: null, holdCount: 2 },
	portfolioError: null,
	valuationError: null,
	attentionNeeded: [],
	attentionError: null
};

const rows = [
	makeRow({
		id: 'h1',
		name: '하나종목',
		ticker: '000111',
		value_krw: 1_234_567,
		open_status: 'pending'
	}),
	makeRow({
		id: 'h2',
		name: '둘종목',
		ticker: 'QQQX',
		currency: 'USD',
		market: 'NASDAQ',
		price: 8.765,
		price_currency: 'USD',
		avg_price: null,
		qty: 2,
		value_krw: 23_000,
		asset_type: 'etf'
	}),
	makeRow({
		id: 'p1',
		name: '계획종목',
		status: 'planned',
		qty: 9,
		avg_price: 4321,
		value_krw: null
	}),
	makeRow({ id: 'c1', name: '끝난종목', status: 'closed', qty: 0, value_krw: null })
];

const withRows = (over: Record<string, unknown> = {}) =>
	({
		...base,
		portfolio: { ...base.portfolio, rows, usdkrw: 1400.5 },
		...over
	}) as never;

const text = (c: Element) => c.textContent ?? '';
const table = (c: Element) => c.querySelector('[data-testid="portfolio-table"]') as HTMLElement;
const rowOf = (c: Element, name: string) =>
	[...table(c).querySelectorAll('tbody tr')].find((tr) => text(tr).includes(name)) as
		| HTMLElement
		| undefined;
const cell = (tr: Element, label: string) =>
	tr.querySelector(`td[data-label="${label}"]`) as HTMLElement;
const segButton = (c: Element, label: RegExp) =>
	[...c.querySelectorAll('[aria-label="보유·매수 계획 구분"] button')].find((b) =>
		label.test(text(b))
	) as HTMLElement;

describe('FE-05 포트폴리오 표', () => {
	it('세그먼트 건수: 전체 / 보유 2 / 매수 계획 1, 보유 종료는 전체에서만', async () => {
		const { container } = render(Page, { data: withRows() });
		expect(segButton(container, /^전체$/)).toBeTruthy();
		expect(segButton(container, /^보유 2$/)).toBeTruthy();
		expect(segButton(container, /^매수 계획 1$/)).toBeTruthy();
		expect(rowOf(container, '끝난종목')).toBeTruthy();
		expect(text(rowOf(container, '끝난종목')!)).toContain('보유 종료');

		segButton(container, /^보유 2$/).click();
		flushSync();
		expect(rowOf(container, '끝난종목')).toBeUndefined();
		expect(rowOf(container, '계획종목')).toBeUndefined();
		expect(rowOf(container, '하나종목')).toBeTruthy();

		segButton(container, /^매수 계획 1$/).click();
		flushSync();
		expect(rowOf(container, '끝난종목')).toBeUndefined();
		expect(rowOf(container, '계획종목')).toBeTruthy();
	});

	it('매수 계획 행은 수량·평균 단가가 —', async () => {
		const { container } = render(Page, { data: withRows() });
		const tr = rowOf(container, '계획종목')!;
		expect(text(cell(tr, '수량')).trim()).toBe('—');
		expect(text(cell(tr, '평균 단가')).trim()).toBe('—');
		expect(text(cell(tr, '평가금액')).trim()).toBe('—');
		expect(text(tr)).not.toContain('4,321');
	});

	it('USD 단가는 $ 소수 2자리 + 통화 배지, 평균 단가 없으면 입력 대기', async () => {
		const { container } = render(Page, { data: withRows() });
		const tr = rowOf(container, '둘종목')!;
		expect(text(cell(tr, '현재가')).trim()).toBe('$8.77');
		expect(text(tr.querySelector('[data-testid="row-ccy"]')!)).toBe('USD');
		expect(text(cell(tr, '평균 단가'))).toContain('—');
		expect(text(cell(tr, '평균 단가'))).toContain('입력 대기');
		expect(text(cell(tr, '수량')).trim()).toBe('2주');
		expect(text(rowOf(container, '하나종목')!.querySelector('[data-testid="row-ccy"]')!)).toBe(
			'KRW'
		);
	});

	it('평가금액은 만 원 축약(정확한 값은 aria-label)', async () => {
		const { container } = render(Page, { data: withRows() });
		const v = cell(rowOf(container, '하나종목')!, '평가금액');
		expect(text(v).trim()).toBe('123만 원');
		expect(v.querySelector('[aria-label]')?.getAttribute('aria-label')).toContain('1,234,567원');
	});

	it('열린 변경 요청이 있는 행에 ● 확인 대기 배지', async () => {
		const { container } = render(Page, { data: withRows() });
		expect(text(cell(rowOf(container, '하나종목')!, '종목'))).toContain('확인 대기');
		expect(text(cell(rowOf(container, '둘종목')!, '종목'))).not.toContain('확인 대기');
	});

	it('표에 수량·평균 단가·감시 가격 등 입력란이 없고 G-4 안내가 표 아래에 있다', async () => {
		const { container } = render(Page, {
			data: withRows({
				portfolio: {
					...base.portfolio,
					rows: [
						makeRow({
							id: 't1',
							name: '감시종목',
							trigger_price: 1000,
							price: 1020,
							breakeven: 990
						}),
						makeRow({ id: 'w1', name: '관심종목', status: 'planned', watch_only: true })
					]
				}
			})
		});
		const t = table(container);
		expect(t.querySelectorAll('input, select, textarea, [contenteditable]')).toHaveLength(0);
		expect(container.querySelectorAll('input, select, textarea')).toHaveLength(0);
		expect(text(cell(rowOf(container, '감시종목')!, '손익분기 가격')).trim()).toBe('990원');
		expect(text(cell(rowOf(container, '감시종목')!, '감시 가격까지'))).toContain('3% 이내');
		expect(text(cell(rowOf(container, '관심종목')!, '감시 가격까지'))).toContain('관심만');
		const notice = container.querySelector('[data-testid="g4-notice"]') as HTMLElement;
		expect(text(notice)).toBe(G4_NOTICE);
		expect(G4_NOTICE).toContain('수량·평균 단가는 표에서 직접 고칠 수 없어요');
	});

	it('지표 4: 총 평가금액·평가손익·달러 환율·확인 대기(보류 N건 별도)', async () => {
		const { container } = render(Page, { data: withRows() });
		const tiles = container.querySelector('[data-testid="portfolio-tiles"]') as HTMLElement;
		const t = text(tiles);
		for (const label of ['총 평가금액', '평가손익', '달러 환율', '확인 대기']) {
			expect(t).toContain(label);
		}
		expect(t).toContain('1,400.50원');
		expect(t).toContain('3건');
		expect(t).toContain('보류 2건 별도');
	});

	it("총 평가금액 안내: 평가금액 없는 보유 종목은 '평가금액 없는 N종목 제외'(가격 없음·환율 없음 모두)", async () => {
		const noFx = makeRow({
			id: 'u1',
			name: '환율없는달러',
			ticker: 'USDX',
			currency: 'USD',
			price: 5.5,
			price_currency: 'USD',
			value_krw: null
		});
		const { container } = render(Page, {
			data: withRows({
				portfolio: { ...base.portfolio, rows: [...rows, noFx], usdkrw: null }
			})
		});
		const tiles = container.querySelector('[data-testid="portfolio-tiles"]') as HTMLElement;
		const t = text(tiles);
		expect(t).toContain('평가금액 없는 1종목 제외');
		expect(t).not.toContain('가격 없는');
	});

	it('load 오류는 일반 문구만(원문 없음)', async () => {
		const { container } = render(Page, {
			data: {
				...base,
				portfolioError: '목록을 불러오지 못했어요.',
				valuationError: '정보를 불러오지 못했어요.'
			} as never
		});
		const t = text(container);
		expect(t).toContain('잠시 후 다시 시도해 주세요.');
		expect(container.querySelector('[data-testid="portfolio-table"]')).toBeNull();
		expect(t).not.toMatch(/permission|denied|positions|PGRST/);
	});

	it('빈 상태: 시안 수치 없이 빈 상태만', async () => {
		const { container } = render(Page, { data: base as never });
		const t = text(container);
		expect(t).toContain('아직 보유 기록이 없어요');
		expect(t).toContain('비중을 낼 평가금액이 없어요');
		expect(t).toContain('수익률을 낼 보유 종목이 없어요');
	});

	it('기록 수정 버튼은 보유 기록(holdings) 행에만', async () => {
		const { container } = render(Page, {
			data: withRows({
				holdings: [
					{
						id: 'h1',
						name: '하나종목',
						status: 'holding',
						currency: 'KRW',
						qty: 3,
						avg_price: 1000,
						approval_version: 1,
						asset_type: 'stock'
					}
				]
			})
		});
		expect(rowOf(container, '하나종목')!.querySelector('[data-action="correct"]')).not.toBeNull();
		expect(rowOf(container, '끝난종목')!.querySelector('[data-action="correct"]')).toBeNull();
	});
});
