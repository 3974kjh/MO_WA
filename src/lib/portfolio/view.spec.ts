/**
 * FE-05 포트폴리오 표 규칙(순수 함수). 값은 시안 샘플과 겹치지 않는 임의 숫자.
 */
import { describe, expect, it } from 'vitest';
import {
	avgPending,
	avgText,
	buildPortfolioRows,
	currencyMismatch,
	filterRows,
	memoLine,
	priceText,
	qtyText,
	rowReturnPct,
	rowWeightPct,
	segmentCounts,
	sortRows,
	unitText
} from './view';
import { makeRow } from './testRow';

const detail = (over: Record<string, unknown>) => ({
	id: 'p1',
	instrument_id: 'i1',
	status: 'holding',
	currency: 'KRW' as const,
	qty: 4,
	avg_price: 500,
	breakeven: null,
	memo: null,
	trigger_price: null,
	trigger_direction: 'below' as const,
	watch_only: false,
	market: 'KRX',
	...over
});

describe('buildPortfolioRows', () => {
	it('승인값·최신가·평가금액·열린 요청(pending 우선)을 합치고, 보유→매수 계획→보유 종료 순', () => {
		const rows = buildPortfolioRows({
			details: [
				detail({ id: 'c1', instrument_id: 'i3', status: 'closed', qty: 0 }),
				detail({ id: 'pl', instrument_id: 'i1', status: 'planned', qty: 0, avg_price: null }),
				detail({ id: 'h1', instrument_id: 'i1' }),
				detail({ id: 'h2', instrument_id: 'i2', currency: 'USD', market: 'NASDAQ' }),
				detail({ id: 'x', status: 'weird' })
			],
			prices: [
				{
					instrument_id: 'i1',
					latest_price: 600,
					latest_price_as_of: '2026-11-20',
					latest_price_currency: 'KRW'
				},
				{
					instrument_id: 'i2',
					latest_price: 7.5,
					latest_price_as_of: '2026-11-19',
					latest_price_currency: 'USD'
				}
			],
			labels: new Map([
				['i1', { name: '가종목', ticker: '000001', asset_type: 'stock' }],
				['i2', { name: '나종목', ticker: 'ABCD', asset_type: 'etf' }]
			]),
			valueById: new Map([
				['h1', 2400],
				['h2', 45000],
				['pl', 999]
			]),
			open: [
				{ position_id: 'h1', status: 'on_hold' },
				{ position_id: 'h1', status: 'pending' },
				{ position_id: 'h2', status: 'on_hold' }
			]
		});
		expect(rows.map((r) => r.id)).toEqual(['h2', 'h1', 'pl', 'c1']);
		const h1 = rows.find((r) => r.id === 'h1')!;
		expect(h1).toMatchObject({
			name: '가종목',
			price: 600,
			price_currency: 'KRW',
			value_krw: 2400,
			open_status: 'pending',
			asset_type: 'stock'
		});
		expect(rows.find((r) => r.id === 'h2')!.open_status).toBe('on_hold');
		// 매수 계획·보유 종료는 평가금액 없음
		expect(rows.find((r) => r.id === 'pl')!.value_krw).toBeNull();
		expect(rows.find((r) => r.id === 'c1')!.value_krw).toBeNull();
	});
});

describe('세그먼트', () => {
	const rows = [
		makeRow({ id: 'a' }),
		makeRow({ id: 'b' }),
		makeRow({ id: 'c', status: 'planned' }),
		makeRow({ id: 'd', status: 'closed' })
	];
	it('건수: 보유 2 · 매수 계획 1 · 전체 4(보유 종료 포함)', () => {
		expect(segmentCounts(rows)).toEqual({ all: 4, holding: 2, planned: 1 });
	});
	it('보유 종료는 전체에서만 보인다', () => {
		expect(filterRows(rows, 'all').map((r) => r.id)).toContain('d');
		expect(filterRows(rows, 'holding').map((r) => r.id)).toEqual(['a', 'b']);
		expect(filterRows(rows, 'planned').map((r) => r.id)).toEqual(['c']);
	});
});

describe('칸 표기', () => {
	it('매수 계획 행은 수량·평균 단가가 —', () => {
		const r = makeRow({ status: 'planned', qty: 5, avg_price: 1234 });
		expect(qtyText(r)).toBe('—');
		expect(avgText(r)).toBe('—');
	});
	it('formatQty: 주식·ETF 정수, cash 소수 2자리까지', () => {
		expect(qtyText(makeRow({ qty: 1234 }))).toBe('1,234주');
		expect(qtyText(makeRow({ qty: 7, asset_type: 'etf' }))).toBe('7주');
		expect(qtyText(makeRow({ qty: 12.345, asset_type: 'cash' }))).toBe('12.35주');
		expect(qtyText(makeRow({ qty: null }))).toBe('—');
	});
	it('USD 단가는 $ + 소수 2자리, KRW 단가는 전체 값', () => {
		expect(unitText(12.3456, 'USD')).toBe('$12.35');
		expect(unitText(1234567, 'KRW')).toBe('1,234,567원');
		expect(unitText(null, 'KRW')).toBe('—');
		expect(avgText(makeRow({ currency: 'USD', avg_price: 3.1 }))).toBe('$3.10');
		expect(priceText(makeRow({ price: 8.765, price_currency: 'USD', currency: 'USD' }))).toBe(
			'$8.77'
		);
	});
	it('보유 행 평균 단가가 없으면 — + 입력 대기', () => {
		const r = makeRow({ avg_price: null });
		expect(avgText(r)).toBe('—');
		expect(avgPending(r)).toBe(true);
		expect(avgPending(makeRow({ status: 'planned', avg_price: null }))).toBe(false);
	});
	it('통화 불일치: 가격 통화 다름 · KRX↔USD · 미국 거래소↔KRW, 채권은 판정 안 함', () => {
		expect(currencyMismatch(makeRow())).toBe(false);
		expect(currencyMismatch(makeRow({ price_currency: 'USD' }))).toBe(true);
		expect(currencyMismatch(makeRow({ currency: 'USD', price_currency: null }))).toBe(true);
		expect(
			currencyMismatch(makeRow({ market: 'NYSE', currency: 'KRW', price_currency: null }))
		).toBe(true);
		expect(
			currencyMismatch(makeRow({ market: 'BOND', currency: 'USD', price_currency: null }))
		).toBe(false);
	});
	it('수익률은 보유 행만, 가격 통화가 다르면 계산하지 않는다', () => {
		expect(rowReturnPct(makeRow({ price: 1100, avg_price: 1000 }))).toBeCloseTo(10);
		expect(rowReturnPct(makeRow({ status: 'planned' }))).toBeNull();
		expect(rowReturnPct(makeRow({ price_currency: 'USD' }))).toBeNull();
	});
	it('비중은 평가금액 있는 보유 행만', () => {
		expect(rowWeightPct(makeRow({ value_krw: 250 }), 1000)).toBe(25);
		expect(rowWeightPct(makeRow({ value_krw: null }), 1000)).toBeNull();
		expect(rowWeightPct(makeRow({ status: 'planned', value_krw: 250 }), 1000)).toBeNull();
		expect(rowWeightPct(makeRow({ value_krw: 250 }), null)).toBeNull();
	});
	it('메모는 첫 줄만', () => {
		expect(memoLine('\n  첫 줄 근거 \n둘째 줄')).toBe('첫 줄 근거');
		expect(memoLine('   ')).toBeNull();
		expect(memoLine(null)).toBeNull();
	});
	it('정렬: 같은 상태면 평가금액 큰 순, 값 없으면 뒤', () => {
		const out = sortRows([
			makeRow({ id: 'n', value_krw: null }),
			makeRow({ id: 's', value_krw: 10 }),
			makeRow({ id: 'b', value_krw: 90 })
		]);
		expect(out.map((r) => r.id)).toEqual(['b', 's', 'n']);
	});
});
