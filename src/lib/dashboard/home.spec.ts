import { describe, expect, it } from 'vitest';
import {
	changeTypeLabel,
	holdingSummary,
	isHomeQueueStatus,
	mergeHomeQueue,
	positionLabel,
	principleLabel,
	queueChanges,
	queueCurrency,
	returnPct,
	shortDate,
	weightItems,
	type HomePosition,
	type HomeQueueItem
} from './home';

const pos = (o: Partial<HomePosition>): HomePosition => ({
	id: 'p',
	instrument_id: 'i',
	name: 'A',
	ticker: 'A',
	status: 'holding',
	currency: 'KRW',
	qty: 10,
	avg_price: 100,
	trigger_price: null,
	trigger_direction: 'below',
	watch_only: false,
	price: 110,
	price_as_of: '2026-11-20',
	value_krw: 1100,
	...o
});

describe('holdingSummary', () => {
	it('평가금액 없는 종목은 합계에 0으로 넣지 않고 따로 센다', () => {
		const s = holdingSummary(
			[pos({ id: 'a' }), pos({ id: 'b', price: null, value_krw: null })],
			null
		);
		expect(s).toMatchObject({ priced: 1, unpriced: 1, totalKrw: 1100, pnlKrw: 100, pnlCount: 1 });
		expect(s.pnlPct).toBeCloseTo(10);
	});
	it('가격은 있어도 환율이 없어 평가금액이 빠진 달러 종목도 unpriced에 센다', () => {
		const s = holdingSummary(
			[pos({ id: 'k' }), pos({ id: 'u', currency: 'USD', price: 10, value_krw: null })],
			null
		);
		expect(s).toMatchObject({ priced: 1, unpriced: 1, totalKrw: 1100 });
	});
	it('보유 종목이 없거나 전부 가격이 없으면 null', () => {
		expect(holdingSummary([], 1300)).toMatchObject({
			totalKrw: null,
			pnlKrw: null,
			pnlPct: null,
			usdSharePct: null
		});
		expect(holdingSummary([pos({ value_krw: null })], 1300).totalKrw).toBeNull();
	});
	it('planned·수량 0은 빼고, 달러 비중과 달러 원가 환산', () => {
		const s = holdingSummary(
			[
				pos({ id: 'k', value_krw: 3000, qty: 10, avg_price: 300 }),
				pos({ id: 'u', currency: 'USD', qty: 1, avg_price: 1, price: 1, value_krw: 1000 }),
				pos({ id: 'pl', status: 'planned', value_krw: 999 }),
				pos({ id: 'z', qty: 0, value_krw: 5 })
			],
			1000
		);
		expect(s.totalKrw).toBe(4000);
		expect(s.usdSharePct).toBeCloseTo(25);
		expect(s.pnlKrw).toBe(0);
	});
	it('환율이 없으면 달러 종목은 손익 계산에서 뺀다', () => {
		const s = holdingSummary([pos({ currency: 'USD', value_krw: 1000 })], null);
		expect(s.pnlKrw).toBeNull();
		expect(s.pnlCount).toBe(0);
	});
});

describe('queue diff', () => {
	it('수량·평균 단가 중 제안 값이 있는 것만, 이전 값은 current_values', () => {
		expect(queueChanges({ qty: 6, avg_price: '290.98' }, { qty: 5 })).toEqual([
			{ field: 'qty', from: 5, to: 6 },
			{ field: 'avg_price', from: null, to: 290.98 }
		]);
		expect(queueChanges({}, null)).toEqual([]);
		expect(queueChanges(null, null)).toEqual([]);
	});
	it('통화: 제안 → 현재 → 포지션 통화', () => {
		expect(queueCurrency({ currency: 'USD' }, null)).toBe('USD');
		expect(queueCurrency({}, { currency: 'USD' })).toBe('USD');
		expect(queueCurrency({}, {}, 'USD')).toBe('USD');
		expect(queueCurrency({}, {}, 'KRW')).toBe('KRW');
	});
	it('통화를 모르면 KRW로 짐작하지 않는다(null)', () => {
		expect(queueCurrency(null, null)).toBeNull();
		expect(queueCurrency({ currency: 'EUR' }, {})).toBeNull();
	});
	it('change_type 표시명(코드는 화면에 쓰지 않음)', () => {
		expect(changeTypeLabel('open_holding')).toBe('신규 매수');
		expect(changeTypeLabel('set_qty_avg')).toBe('수량·평균 단가 변경');
		expect(changeTypeLabel('close')).toBe('보유 종료');
		expect(changeTypeLabel('weird')).toBe('변경 요청');
	});
});

describe('기타', () => {
	it('weightItems: 평가금액 있는 보유만', () => {
		expect(
			weightItems([
				pos({ id: 'a', name: 'X' }),
				pos({ id: 'b', value_krw: null }),
				pos({ status: 'planned' })
			])
		).toEqual([{ label: 'X', value: 1100 }]);
	});
	it('positionLabel: 이름 → 코드 → 대체 문구', () => {
		expect(positionLabel({ name: ' ', ticker: 'NVDA' })).toBe('NVDA');
		expect(positionLabel({ name: null, ticker: null })).toBe('이름 없는 종목');
	});
	it('returnPct·shortDate', () => {
		expect(returnPct({ price: 110, avg_price: 100 })).toBeCloseTo(10);
		expect(returnPct({ price: null, avg_price: 100 })).toBeNull();
		expect(returnPct({ price: 1, avg_price: 0 })).toBeNull();
		expect(shortDate('2026-11-05')).toBe('11/5');
		expect(shortDate('')).toBeNull();
	});
});

describe('홈 확인 대기: 포지션 + 원칙 병합 (FE-07 후속)', () => {
	const item = (kind: HomeQueueItem['kind'], id: string, created_at: string): HomeQueueItem => ({
		kind,
		id,
		status: 'pending',
		change_type: kind === 'principle' ? 'principle' : 'close',
		name: null,
		ticker: null,
		clause_ref: null,
		currency: 'KRW',
		changes: [],
		created_at
	});

	it('mergeHomeQueue: 최신순으로 합치고 limit건만', () => {
		const out = mergeHomeQueue(
			[
				item('position', 'a', '2026-11-01T00:00:00Z'),
				item('position', 'b', '2026-11-03T00:00:00Z')
			],
			[item('principle', 'a', '2026-11-02T00:00:00Z')],
			2
		);
		expect(out.map((i) => `${i.kind}:${i.id}`)).toEqual(['position:b', 'principle:a']);
	});

	it('isHomeQueueStatus: pending·on_hold만', () => {
		expect(['pending', 'on_hold', 'approved', 'expired'].filter(isHomeQueueStatus)).toEqual([
			'pending',
			'on_hold'
		]);
	});

	it('원칙 항목 이름·유형 표시명', () => {
		expect(principleLabel({ clause_ref: ' 2-1 ' })).toBe('2-1');
		expect(principleLabel({ clause_ref: null })).toBe('투자 원칙');
		expect(changeTypeLabel('principle')).toBe('투자 원칙 개정');
	});
});
