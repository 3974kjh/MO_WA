import { describe, expect, it } from 'vitest';
import {
	analysisBack,
	analysisHref,
	isStale,
	isTickerParam,
	kstToday,
	latestAsOf,
	NO_BASIS,
	parseStocksQuery,
	quoteBasis,
	sortBoard,
	stockHref,
	stockKind,
	stockMemo,
	stocksSearch
} from './view';

// 2026-11-28 09:00 KST = 2026-11-28T00:00Z
const NOW = Date.parse('2026-11-28T00:00:00Z');

describe('FE-11 결정 1: 분석 리포트 ← 종목', () => {
	it('들어온 종목(?from)이 리포트 tickers 안이면 그 종목 화면', () => {
		expect(analysisBack('030200', ['035420', '030200'])).toEqual({
			href: '/stocks/030200',
			ticker: '030200'
		});
	});
	it('직접 진입: tickers 1개 → 그 종목, 여러 개 → /stocks', () => {
		expect(analysisBack(null, ['108490'])).toEqual({ href: '/stocks/108490', ticker: '108490' });
		expect(analysisBack(null, ['GOOGL', '005380'])).toEqual({ href: '/stocks', ticker: null });
		expect(analysisBack(null, [])).toEqual({ href: '/stocks', ticker: null });
	});
	it('from이 tickers 밖이거나 형식 밖이면 무시(직접 진입과 같음)', () => {
		expect(analysisBack('005930', ['108490']).href).toBe('/stocks/108490');
		expect(analysisBack('../x', ['GOOGL', 'QBTS']).href).toBe('/stocks');
	});
	it('종목 화면에서 여는 링크에만 ?from=', () => {
		expect(analysisHref('plan-108490', '108490')).toBe('/analyses/plan-108490?from=108490');
		expect(analysisHref('googl')).toBe('/analyses/googl');
		expect(analysisHref('googl', 'bad code')).toBe('/analyses/googl');
	});
});

describe('FE-11 결정 2: 관심 종목', () => {
	const k = (o: Partial<Parameters<typeof stockKind>[0]>) =>
		stockKind({ holding: false, planned: false, watchOnly: false, isWatchlist: false, ...o });
	it('보유가 있으면 보유(관심 조건이 있어도)', () => {
		expect(k({ holding: true, planned: true, isWatchlist: true })).toBe('hold');
	});
	it('미보유 중 매수 계획 · watch_only · is_watchlist 중 하나면 관심', () => {
		expect(k({ planned: true })).toBe('watch');
		expect(k({ watchOnly: true })).toBe('watch');
		expect(k({ isWatchlist: true })).toBe('watch');
	});
	it('어느 것도 아니면 보드에 없음', () => {
		expect(k({})).toBeNull();
	});
});

describe('FE-11 결정 3: stock·etf만 종목 화면', () => {
	it('stock·etf만 링크, bond·cash·코드 없음은 null', () => {
		expect(stockHref('035420', 'stock')).toBe('/stocks/035420');
		expect(stockHref('SGOV', 'etf')).toBe('/stocks/SGOV');
		expect(stockHref('UST_30Y', 'bond')).toBeNull();
		expect(stockHref('KR_CORP_BOND', 'bond')).toBeNull();
		expect(stockHref('CASH_KRW', 'cash')).toBeNull();
		expect(stockHref(null, 'stock')).toBeNull();
		expect(stockHref('035420', null)).toBeNull();
	});
	it('코드 형식: KRX 6자리 · 미국 티커 · 내부 코드만', () => {
		for (const t of ['035420', 'GOOGL', 'BRK.B', 'UST_30Y']) expect(isTickerParam(t)).toBe(true);
		for (const t of ['', 'googl', '12345', '../etc', 'A B', 'X'.repeat(40)])
			expect(isTickerParam(t)).toBe(false);
	});
});

describe('FE-11 결정 4: 오래됨 · 기준 시각 없음', () => {
	it('오늘(KST) 기준 3일 초과만 오래됨(경계 3일은 아님)', () => {
		expect(kstToday(NOW)).toBe('2026-11-28');
		expect(isStale('2026-11-25', NOW)).toBe(false);
		expect(isStale('2026-11-24', NOW)).toBe(true);
		expect(isStale('2026-11-28', NOW)).toBe(false);
	});
	it('KST 날짜로 계산(UTC 전날 밤 15시 이후는 이미 다음 날)', () => {
		const lateUtc = Date.parse('2026-11-28T15:30:00Z'); // KST 11/29 00:30
		expect(kstToday(lateUtc)).toBe('2026-11-29');
		expect(isStale('2026-11-25', lateUtc)).toBe(true);
	});
	it('값이 없거나 읽을 수 없으면 오래됨 아님(대신 기준 시각 없음)', () => {
		expect(isStale(null, NOW)).toBe(false);
		expect(isStale('not-a-date', NOW)).toBe(false);
		expect(quoteBasis(null, 'KRX')).toBe(NO_BASIS);
		expect(quoteBasis('', 'NASDAQ')).toBe(NO_BASIS);
	});
	it('기준 문구: 국내 KRX 종가 · 미국 현지 종가', () => {
		expect(quoteBasis('2026-11-20', 'KRX')).toBe('11/20(금) KRX 종가');
		expect(quoteBasis('2026-11-19', 'NASDAQ')).toBe('11/19(목) 미국 현지 종가');
		expect(quoteBasis('2026-11-19', 'NYSEARCA')).toBe('11/19(목) 미국 현지 종가');
	});
	it('시장별 마지막 시세 날짜', () => {
		expect(
			latestAsOf([
				{ as_of: '2026-11-20', market: 'KRX' },
				{ as_of: '2026-11-19', market: 'KRX' },
				{ as_of: '2026-11-19', market: 'NASDAQ' },
				{ as_of: null, market: 'NYSE' }
			])
		).toEqual({ kr: '2026-11-20', us: '2026-11-19', last: '2026-11-20' });
		expect(latestAsOf([])).toEqual({ kr: null, us: null, last: null });
	});
});

describe('FE-11 보드 쿼리·정렬', () => {
	it('허용 밖 값은 기본값, 기본값은 주소에 안 남김', () => {
		const q = parseStocksQuery(new URLSearchParams('q=%20네이버%20&f=nope&sort=trig'));
		expect(q).toEqual({ q: '네이버', f: 'all', sort: 'trig' });
		expect(stocksSearch(q)).toBe('?q=%EB%84%A4%EC%9D%B4%EB%B2%84&sort=trig');
		expect(stocksSearch({ q: '', f: 'all', sort: 'default' })).toBe('');
	});
	it('등락률·감시 가격 거리 정렬은 값 없는 행을 뒤로', () => {
		const rows = [
			{ name: 'a', ticker: 'A', change_pct: 1, distance: null },
			{ name: 'b', ticker: 'B', change_pct: null, distance: 2 },
			{ name: 'c', ticker: 'C', change_pct: -2, distance: 0.5 }
		];
		expect(sortBoard(rows, 'chg').map((r) => r.ticker)).toEqual(['C', 'A', 'B']);
		expect(sortBoard(rows, 'trig').map((r) => r.ticker)).toEqual(['C', 'B', 'A']);
		expect(sortBoard(rows, 'default').map((r) => r.ticker)).toEqual(['A', 'B', 'C']);
	});
});

describe('FE-11 종목 메모', () => {
	it('이 종목이 주 대상인 최신 분석의 이유·관점(텍스트)만', () => {
		const reports = [
			{
				tickers: ['035420', '030200'],
				meta: { primary_tickers: ['035420'], selection_reason: 'X' }
			},
			{
				tickers: ['030200'],
				meta: {
					selection_reason: '배당',
					alignment: 'aligned',
					lenses: { social: { text: '통신', source: 'a' }, policy: { text: ' ' } }
				}
			}
		];
		expect(stockMemo(reports, '030200')).toEqual({
			reason: '배당',
			reasonSource: null,
			alignment: 'aligned',
			alignReason: null,
			lenses: [{ key: 'social', text: '통신', source: 'a' }]
		});
		expect(stockMemo(reports, '005380')).toBeNull();
	});
});
