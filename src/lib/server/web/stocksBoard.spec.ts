/**
 * FE-11 /stocks 보드 조립. 운영 기록(I-7 적재분)과 같은 모양의 가상 기록으로 결정 2·3을 확인한다.
 * 이름·코드는 공개 종목명이고 금액·수량은 임의 값이다.
 */
import { describe, expect, it } from 'vitest';
import type { EquityReportLite, StockInstrument, StockPosition } from '$lib/server/repo';
import { buildStockBoard } from './stocksBoard';

const inst = (id: string, ticker: string, name: string, market = 'KRX', o = {}) =>
	({ id, ticker, name, market, asset_type: 'stock', is_watchlist: false, ...o }) as StockInstrument;
const pos = (id: string, instrument_id: string, o: Partial<StockPosition> = {}): StockPosition => ({
	id,
	instrument_id,
	status: 'holding',
	currency: 'KRW',
	qty: 10,
	avg_price: 100,
	breakeven: null,
	trigger_price: null,
	trigger_direction: 'below',
	watch_only: false,
	memo: null,
	base_at: null,
	...o
});

// listStockInstruments가 이미 stock·etf만 거른다(결정 3) — 채권은 목록에 없다.
const instruments = [
	inst('i1', '035420', 'NAVER'),
	inst('i2', '030200', 'KT'),
	inst('i3', '108490', '로보티즈'),
	inst('i4', '005380', '현대차'),
	inst('i5', 'GOOGL', '알파벳 A', 'NASDAQ'),
	inst('i6', 'QBTS', '디웨이브퀀텀', 'NYSE'),
	inst('i7', 'SGOV', 'SGOV', 'NYSEARCA', { asset_type: 'etf' }),
	inst('i10', '000660', 'SK하이닉스', 'KRX', { is_watchlist: true }),
	inst('i11', '005930', '삼성전자') // 포지션·관심 없음 → 보드에 없음
];
const positions = [
	pos('p1', 'i1'),
	pos('p2', 'i2'),
	pos('p3', 'i3', { status: 'planned', qty: null, avg_price: null, trigger_price: 210000 }),
	pos('p4', 'i4', { status: 'planned', qty: null, avg_price: null, watch_only: true }),
	pos('p5', 'i5', { currency: 'USD', trigger_price: 270.7 }),
	pos('p6', 'i6', { currency: 'USD' }),
	pos('p7', 'i7', { currency: 'USD' }),
	// 채권 보유(UST_30Y 등)는 instruments에 없으니 보드에 나오지 않는다
	pos('p8', 'i8', { currency: 'USD' })
];
const quotes = [
	{ instrument_id: 'i1', as_of: '2026-11-20', close: 200, change_pct: -1.2, currency: 'KRW' },
	{ instrument_id: 'i5', as_of: '2026-11-19', close: 280, change_pct: 0.5, currency: 'USD' }
];
const report = (slug: string, tickers: string[], o: Partial<EquityReportLite> = {}) =>
	({
		id: slug,
		slug,
		title: slug,
		subtype: 'buy_plan',
		status: 'draft',
		report_date: '2026-11-20',
		tickers,
		summary: null,
		...o
	}) as EquityReportLite;

describe('FE-11 buildStockBoard', () => {
	const { rows, drafts } = buildStockBoard({
		instruments,
		positions,
		quotes: quotes as never,
		reports: [
			report('plan-108490', ['108490']),
			report('googl-005380', ['GOOGL', '005380'], {
				subtype: 'equity_analysis',
				status: 'published'
			})
		],
		usdkrw: { value: 1400, as_of: '2026-11-20' }
	});
	const by = (k: string) => rows.filter((r) => r.kind === k).map((r) => r.name);

	it('결정 2: 관심 = 미보유 중 계획·watch_only·is_watchlist → 로보티즈·현대차·SK하이닉스', () => {
		expect(by('watch')).toEqual(['로보티즈', '현대차', 'SK하이닉스']);
	});
	it('보유 6종(stock·etf)만, 채권·관심 없는 종목은 없음', () => {
		expect(by('hold')).toEqual(['NAVER', 'KT', '알파벳 A', '디웨이브퀀텀', 'SGOV']);
		expect(rows.map((r) => r.ticker)).not.toContain('005930');
		expect(rows).toHaveLength(8);
	});
	it('보유 행은 평가금액(원화 환산), 관심 행은 수량·평가 없이 감시 가격만', () => {
		const naver = rows.find((r) => r.ticker === '035420')!;
		expect(naver).toMatchObject({ price: 200, qty: 10, value_krw: 2000, as_of: '2026-11-20' });
		const googl = rows.find((r) => r.ticker === 'GOOGL')!;
		expect(googl).toMatchObject({
			currency: 'USD',
			value_krw: 280 * 10 * 1400,
			trigger_price: 270.7
		});
		const robo = rows.find((r) => r.ticker === '108490')!;
		expect(robo).toMatchObject({ qty: null, value_krw: null, trigger_price: 210000, price: null });
		expect(robo.report?.slug).toBe('plan-108490');
	});
	it('시세가 없으면 값을 짓지 않는다(null)', () => {
		const kt = rows.find((r) => r.ticker === '030200')!;
		expect(kt).toMatchObject({ price: null, change_pct: null, as_of: null, value_krw: null });
	});
	it('확정 전 매수 계획서(buy_plan·draft) 이름', () => {
		expect(drafts).toEqual(['로보티즈']);
	});
	it('여러 종목 리포트는 각 종목의 최신 리포트로 붙는다', () => {
		expect(rows.find((r) => r.ticker === '005380')?.report?.slug).toBe('googl-005380');
		expect(rows.find((r) => r.ticker === 'GOOGL')?.report?.slug).toBe('googl-005380');
	});
});
