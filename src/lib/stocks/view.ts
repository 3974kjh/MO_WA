/**
 * FE-11 종목 보드·상세 화면 규칙(순수 함수, 서버 load와 화면이 함께 쓴다).
 *
 * PM이 전한 사용자 결정(2026-11-28 08:32 KST)
 * 1) 분석 리포트 '← 종목': 들어온 종목 화면(`?from=`)으로. 직접 진입이면 tickers 1개 → 그 종목, 여러 개 → /stocks.
 * 2) 관심 종목 = 보유하지 않은 종목 중 (매수 계획 있음 OR watch_only OR is_watchlist).
 * 3) /stocks 목록·상세는 asset_type stock·etf만. bond·cash는 상세에서 포트폴리오 안내.
 * 4) 오래됨 = 마지막 price_snapshots.as_of가 오늘(KST)보다 3일 넘게 전. as_of 없으면 '기준 시각 없음'.
 */
import { formatMoney } from '$lib/format/money';
import { cleanText } from '$lib/routing/listQuery';

export const STOCK_ASSET_TYPES = ['stock', 'etf'] as const;
export const STALE_DAYS = 3;
export const NO_BASIS = '기준 시각 없음';

export function isStockAsset(assetType: string | null | undefined): boolean {
	return assetType === 'stock' || assetType === 'etf';
}

/** instruments CHECK와 같은 세 형식(KRX 6자리 · 미국 티커 · 내부 코드). 밖이면 DB를 읽지 않고 404. */
const TICKER_PARAM = /^(\d{6}|[A-Z]{1,5}([.-][A-Z]{1,2})?|[A-Z][A-Z0-9_]{1,31})$/;
export function isTickerParam(t: string | null | undefined): t is string {
	return t != null && TICKER_PARAM.test(t);
}

/** 종목 상세 경로. stock·etf이고 코드가 있을 때만(그 밖은 링크를 만들지 않는다). */
export function stockHref(
	ticker: string | null | undefined,
	assetType: string | null | undefined
): `/stocks/${string}` | null {
	return isTickerParam(ticker) && isStockAsset(assetType) ? `/stocks/${ticker}` : null;
}

export type StockKind = 'hold' | 'watch';

/** 결정 2. 보유(holding)가 있으면 hold, 아니면 계획·watch_only·is_watchlist 중 하나라도 있으면 watch. */
export function stockKind(s: {
	holding: boolean;
	planned: boolean;
	watchOnly: boolean;
	isWatchlist: boolean;
}): StockKind | null {
	if (s.holding) return 'hold';
	return s.planned || s.watchOnly || s.isWatchlist ? 'watch' : null;
}

/** 오늘 날짜(KST) `YYYY-MM-DD`. */
export function kstToday(now: number = Date.now()): string {
	return new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 결정 4. as_of(date)가 오늘(KST)보다 STALE_DAYS일 넘게 전이면 true. 값이 없거나 읽을 수 없으면 false. */
export function isStale(asOf: string | null | undefined, now: number = Date.now()): boolean {
	const d = asOf ? Date.parse(asOf.slice(0, 10)) : NaN;
	if (Number.isNaN(d)) return false;
	return (Date.parse(kstToday(now)) - d) / 86_400_000 > STALE_DAYS;
}

const US = new Set(['NASDAQ', 'NYSE', 'NYSEARCA', 'AMEX']);
const WD = '일월화수목금토';

/** 시세 기준 문구: `11/20(금) KRX 종가` · `11/19(목) 미국 현지 종가`. as_of가 없으면 '기준 시각 없음'. */
export function quoteBasis(asOf: string | null | undefined, market: string | null | undefined) {
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(asOf ?? '');
	if (!m) return NO_BASIS;
	const wd = WD[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
	const tail = market === 'KRX' ? 'KRX 종가' : US.has(market ?? '') ? '미국 현지 종가' : '종가';
	return `${+m[2]}/${+m[3]}(${wd}) ${tail}`;
}

export function marketLabel(market: string | null | undefined): string {
	return market === 'KRX' ? '국내' : US.has(market ?? '') ? '미국' : (market ?? '');
}

// ── /stocks 보드 쿼리 ──
export const STOCK_FILTERS = ['all', 'hold', 'watch'] as const;
export type StockFilter = (typeof STOCK_FILTERS)[number];
export const STOCK_SORTS = ['default', 'chg', 'trig'] as const;
export type StockSort = (typeof STOCK_SORTS)[number];
export type StocksQuery = { q: string; f: StockFilter; sort: StockSort };

function pick<T extends string>(list: readonly T[], v: string | null, d: T): T {
	return (list as readonly string[]).includes(v ?? '') ? (v as T) : d;
}

export function parseStocksQuery(sp: URLSearchParams): StocksQuery {
	return {
		q: cleanText(sp.get('q')),
		f: pick(STOCK_FILTERS, sp.get('f'), 'all'),
		sort: pick(STOCK_SORTS, sp.get('sort'), 'default')
	};
}

/** 기본값은 URL에서 뺀다. 결과는 `?…` 또는 빈 문자열. */
export function stocksSearch(q: StocksQuery): string {
	const sp = new URLSearchParams();
	const text = cleanText(q.q);
	if (text) sp.set('q', text);
	if (q.f !== 'all') sp.set('f', q.f);
	if (q.sort !== 'default') sp.set('sort', q.sort);
	const s = sp.toString();
	return s ? `?${s}` : '';
}

export type BoardSortable = {
	name: string;
	ticker: string;
	change_pct: number | null;
	/** 감시 가격까지 거리(%). 없으면 null */
	distance: number | null;
};

export function matchesQuery(r: Pick<BoardSortable, 'name' | 'ticker'>, q: string): boolean {
	const t = q.trim().toLowerCase();
	return !t || `${r.name} ${r.ticker}`.toLowerCase().includes(t);
}

/** 정렬: default = 입력 순서 그대로, chg = 등락률 낮은 순(없으면 뒤), trig = 감시 가격 가까운 순(없으면 뒤). */
export function sortBoard<T extends BoardSortable>(rows: readonly T[], sort: StockSort): T[] {
	if (sort === 'default') return [...rows];
	const key = (r: T) => (sort === 'chg' ? r.change_pct : r.distance) ?? Infinity;
	return rows.toSorted((a, b) => key(a) - key(b));
}

// ── 결정 1: 분석 리포트 '← 종목' ──
export type AnalysisBack = { href: string; ticker: string | null };

export function analysisBack(from: string | null, tickers: readonly string[]): AnalysisBack {
	if (isTickerParam(from) && tickers.includes(from))
		return { href: `/stocks/${from}`, ticker: from };
	if (tickers.length === 1 && isTickerParam(tickers[0]))
		return { href: `/stocks/${tickers[0]}`, ticker: tickers[0] };
	return { href: '/stocks', ticker: null };
}

/** 리포트 링크(종목 화면에서 들어갈 때 `?from=`을 붙인다). */
export function analysisHref(slug: string, from?: string | null): string {
	return `/analyses/${slug}${isTickerParam(from) ? `?from=${from}` : ''}`;
}

// ── 시장관 일치·관점 (텍스트로만 렌더) ──
export const ALIGNMENT_LABEL: Record<string, { label: string; tone: 'ok' | 'warn' | 'default' }> = {
	aligned: { label: '✓ 일치', tone: 'ok' },
	partial: { label: '◐ 일부 일치', tone: 'warn' },
	conflict: { label: '⚠ 어긋남', tone: 'warn' },
	unchecked: { label: '확인 전', tone: 'default' }
};

export const LENS_LABEL = { social: '사회', corporate: '기업', policy: '정책' } as const;

/** 관점 값: 문자열이면 그대로, `{text, source}`면 text(+출처). 그 밖은 '표시할 수 없음'. JSON으로 바꾸지 않는다. */
export function lensText(v: unknown): { text: string; source: string | null } | null {
	if (v == null) return null;
	if (typeof v === 'string') return v.trim() ? { text: v, source: null } : null;
	if (typeof v === 'object' && typeof (v as { text?: unknown }).text === 'string') {
		const o = v as { text: string; source?: unknown };
		if (!o.text.trim()) return null;
		return { text: o.text, source: typeof o.source === 'string' ? o.source : null };
	}
	return { text: '표시할 수 없음', source: null };
}

/** 52주(기록이 1년보다 짧으면 '기록 기간') 범위 안 현재 위치 0~100. 범위가 없으면 null. */
export function rangePosition(lo: number, hi: number, v: number): number | null {
	if (!(hi > lo)) return null;
	return Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
}

/** 단가 전체 값(USD 소수 둘째 자리). 없으면 '—'. */
export function unitPrice(v: number | null | undefined, ccy: 'KRW' | 'USD'): string {
	return v == null ? '—' : formatMoney(v, ccy, 'unit').exact;
}

/** 리포트 배지 문구: 매수 계획서 · 초안/게시됨 · 기업분석. */
export function reportKindLabel(r: { subtype: string | null; status: string }): string {
	return r.subtype === 'buy_plan'
		? `매수 계획서 · ${r.status === 'draft' ? '초안' : '게시됨'}`
		: `기업분석${r.status === 'draft' ? ' · 초안' : ''}`;
}

/** 시장별 마지막 시세 날짜(국내 KRX / 그 밖 = 미국)와 전체 마지막 날짜. */
export function latestAsOf(rows: readonly { as_of: string | null; market: string }[]) {
	const max = (a: string | null, b: string | null) => (!a || (b && b > a) ? b : a);
	let kr: string | null = null;
	let us: string | null = null;
	for (const r of rows) {
		if (r.market === 'KRX') kr = max(kr, r.as_of);
		else us = max(us, r.as_of);
	}
	const last = max(kr, us);
	return { kr, us, last };
}

export type StockMemo = {
	reason: string | null;
	reasonSource: string | null;
	alignment: string | null;
	alignReason: string | null;
	lenses: Array<{ key: keyof typeof LENS_LABEL; text: string; source: string | null }>;
};

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);

/**
 * 종목 메모: 이 종목이 주 대상(meta.primary_tickers, 없으면 tickers[0])인 최신 분석의 선택 이유·시장관·세 관점.
 * 모두 텍스트로만 쓴다(마크다운 렌더 없음). 없으면 null.
 */
export function stockMemo(
	reports: readonly { tickers: string[]; meta?: Record<string, unknown> | null }[],
	ticker: string
): StockMemo | null {
	for (const r of reports) {
		const m = r.meta ?? {};
		const primary = Array.isArray(m.primary_tickers) ? m.primary_tickers : r.tickers.slice(0, 1);
		if (!primary.includes(ticker)) continue;
		const lensObj = (m.lenses && typeof m.lenses === 'object' ? m.lenses : {}) as Record<
			string,
			unknown
		>;
		const lenses = (Object.keys(LENS_LABEL) as Array<keyof typeof LENS_LABEL>).flatMap((key) => {
			const t = lensText(lensObj[key]);
			return t ? [{ key, ...t }] : [];
		});
		const memo: StockMemo = {
			reason: str(m.selection_reason),
			reasonSource: str(m.reason_source),
			alignment: ALIGNMENT_LABEL[str(m.alignment) ?? ''] ? (m.alignment as string) : null,
			alignReason: str(m.align_reason),
			lenses
		};
		if (memo.reason || memo.alignment || lenses.length) return memo;
	}
	return null;
}

/**
 * 같은 slug 리포트는 report_date 최신 1건만(PM 결정 2026-11-28). 목록이 이미 최신순이라 첫 건을 남긴다.
 * 같은 slug 두 건이 같은 링크·키가 되어 화면이 깨지는 것(each_key_duplicate)도 막는다.
 */
export function latestBySlug<T extends { slug: string }>(list: readonly T[]): T[] {
	const seen = new Set<string>();
	return list.filter((r) => !seen.has(r.slug) && (seen.add(r.slug), true));
}
