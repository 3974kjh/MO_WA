/**
 * FE-05 포트폴리오 표 규칙 — 서버 load와 화면이 같이 쓰는 순수 함수.
 * 명세: work-breakdown FE-05, DS §3-1·§10·원칙 5, 시안 `screens/portfolio.html`(값은 옮기지 않는다).
 * - 숫자는 승인된 보유 기록 값만 쓴다. 대기 요청이 있는 행은 배지만 붙인다(값을 미리 바꾸지 않는다).
 * - 매수 계획 행은 수량·평균 단가가 '—'. 보유 종료 행은 '전체'에서만 보인다.
 * - 단가(평균 단가·손익분기 가격·현재가)는 전체 값, 평가금액은 만 원 축약(Money 컴포넌트). USD 단가는 `$` 소수 2자리.
 * - 감시 가격·방향·손익분기 가격·관심만은 읽기 전용(투자 관리 봇이 정한다).
 */
import type { HomePosition } from '$lib/dashboard/home';
import { returnPct } from '$lib/dashboard/home';
import { formatMoney, type Currency } from '$lib/format/money';
import { formatField } from '$lib/queue/proposals';

import { PORTFOLIO_STATUSES, type PortfolioStatus } from './status';
export { PORTFOLIO_STATUSES, type PortfolioStatus };
export type OpenStatus = 'pending' | 'on_hold';

/** 화면 한 행. HomePosition과 같은 모양이라 홈의 요약·비중·감시 가격 계산을 그대로 쓴다. */
export type PortfolioRow = HomePosition & {
	asset_type: string | null;
	market: string | null;
	breakeven: number | null;
	memo: string | null;
	/** 최신가 통화(가격 기록 기준). 없으면 null */
	price_currency: string | null;
	/** 이 행에 걸린 열린 변경 요청(pending 우선). 없으면 null */
	open_status: OpenStatus | null;
};

export type Segment = 'all' | 'holding' | 'planned';

export const STATUS_LABEL: Record<string, string> = {
	holding: '보유',
	planned: '매수 계획',
	closed: '보유 종료'
};

export const G4_NOTICE =
	'수량·평균 단가는 표에서 직접 고칠 수 없어요. 봇 변경 요청은 아래 ‘변경 요청’에서 반영하고, 내 기록이 틀렸다면 행의 기록 수정에서 확인 뒤 반영돼요(5초 안에 되돌릴 수 있어요). 감시 가격·방향·손익분기 가격·관심만은 투자 관리 봇이 정해요. 여기서는 바꿀 수 없어요.';

/* ── 서버 load: 행 만들기 ── */

export type RowDetailInput = {
	id: string;
	instrument_id: string;
	status: string;
	currency: Currency;
	qty: number | null;
	avg_price: number | null;
	breakeven: number | null;
	memo: string | null;
	trigger_price: number | null;
	trigger_direction: 'below' | 'above';
	watch_only: boolean;
	market: string | null;
};

export type RowPriceInput = {
	instrument_id: string;
	latest_price: number | null;
	latest_price_as_of: string | null;
	latest_price_currency: string | null;
};

export function buildPortfolioRows(input: {
	details: readonly RowDetailInput[];
	/** listPositionCards 결과(최신가). 종목 기준으로 찾는다 */
	prices: readonly RowPriceInput[];
	labels: ReadonlyMap<
		string,
		{ name: string | null; ticker: string | null; asset_type: string | null }
	>;
	/** valuation 결과(보유 행만 값이 있다) */
	valueById: ReadonlyMap<string, number | null>;
	open: ReadonlyArray<{ position_id: string; status: OpenStatus }>;
}): PortfolioRow[] {
	const priceByInstrument = new Map<string, RowPriceInput>();
	for (const p of input.prices) {
		if (p.latest_price != null && !priceByInstrument.has(p.instrument_id)) {
			priceByInstrument.set(p.instrument_id, p);
		}
	}
	const openById = new Map<string, OpenStatus>();
	for (const o of input.open) {
		if (openById.get(o.position_id) !== 'pending') openById.set(o.position_id, o.status);
	}
	const rows = input.details
		.filter((d) => (PORTFOLIO_STATUSES as readonly string[]).includes(d.status))
		.map((d): PortfolioRow => {
			const l = input.labels.get(d.instrument_id);
			const price = priceByInstrument.get(d.instrument_id);
			return {
				id: d.id,
				instrument_id: d.instrument_id,
				name: l?.name ?? null,
				ticker: l?.ticker ?? null,
				status: d.status,
				currency: d.currency,
				qty: d.qty,
				avg_price: d.avg_price,
				trigger_price: d.trigger_price,
				trigger_direction: d.trigger_direction === 'above' ? 'above' : 'below',
				watch_only: Boolean(d.watch_only),
				price: price?.latest_price ?? null,
				price_as_of: price?.latest_price_as_of ?? null,
				value_krw: d.status === 'holding' ? (input.valueById.get(d.id) ?? null) : null,
				asset_type: l?.asset_type ?? null,
				market: d.market,
				breakeven: d.breakeven,
				memo: d.memo,
				price_currency: price?.latest_price_currency ?? null,
				open_status: openById.get(d.id) ?? null
			};
		});
	return sortRows(rows);
}

const STATUS_ORDER: Record<string, number> = { holding: 0, planned: 1, closed: 2 };

/** 보유(평가금액 큰 순, 값 없으면 뒤) → 매수 계획 → 보유 종료, 같으면 이름순. */
export function sortRows<T extends Pick<PortfolioRow, 'status' | 'value_krw' | 'name' | 'ticker'>>(
	rows: readonly T[]
): T[] {
	return rows.toSorted((a, b) => {
		const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
		if (s !== 0) return s;
		const av = a.value_krw;
		const bv = b.value_krw;
		if (av != null && bv != null && av !== bv) return bv - av;
		if (av == null && bv != null) return 1;
		if (bv == null && av != null) return -1;
		return (a.name ?? a.ticker ?? '').localeCompare(b.name ?? b.ticker ?? '', 'ko');
	});
}

/* ── 세그먼트 ── */

export function segmentCounts(rows: readonly Pick<PortfolioRow, 'status'>[]) {
	return {
		all: rows.length,
		holding: rows.filter((r) => r.status === 'holding').length,
		planned: rows.filter((r) => r.status === 'planned').length
	};
}

/** 보유 종료 행은 '전체'에서만 보인다. */
export function filterRows<T extends Pick<PortfolioRow, 'status'>>(
	rows: readonly T[],
	seg: Segment
): T[] {
	return seg === 'all' ? [...rows] : rows.filter((r) => r.status === seg);
}

/* ── 칸 표기 ── */

const DASH = '—';

/** 단가 한 칸(전체 값, USD `$` 소수 2자리). 없으면 '—'. */
export function unitText(v: number | null | undefined, ccy: Currency): string {
	if (v == null || !Number.isFinite(v)) return DASH;
	const f = formatMoney(v, ccy, 'unit');
	return `${f.text}${f.unit}`;
}

/** 수량: 매수 계획은 '—'. 그 밖은 formatQty(주식·ETF 정수, cash 소수 2자리) + 단위. */
export function qtyText(
	r: Pick<PortfolioRow, 'status' | 'qty' | 'currency' | 'asset_type'>
): string {
	if (r.status === 'planned') return DASH;
	return formatField('qty', r.qty, r.currency, r.asset_type);
}

/** 평균 단가: 매수 계획은 '—'. 보유인데 값이 없으면 '—'(화면에 '입력 대기' 안내). */
export function avgText(r: Pick<PortfolioRow, 'status' | 'avg_price' | 'currency'>): string {
	if (r.status === 'planned') return DASH;
	return unitText(r.avg_price, r.currency);
}

/** 보유 행인데 평균 단가가 비어 있다(기록 입력 대기). */
export function avgPending(r: Pick<PortfolioRow, 'status' | 'avg_price'>): boolean {
	return r.status === 'holding' && r.avg_price == null;
}

const US_MARKETS = new Set(['NASDAQ', 'NYSE', 'NYSEARCA', 'AMEX']);

/**
 * 시장·통화 불일치: 가격 기록 통화가 보유 통화와 다르거나, 시장이 정한 통화와 보유 통화가 다르다
 * (KRX ↔ KRW, 미국 거래소 ↔ USD). 채권·기타 시장은 판정하지 않는다.
 */
export function currencyMismatch(
	r: Pick<PortfolioRow, 'currency' | 'market' | 'price_currency'>
): boolean {
	if (r.price_currency != null && r.price_currency !== r.currency) return true;
	if (r.market === 'KRX') return r.currency !== 'KRW';
	if (r.market != null && US_MARKETS.has(r.market)) return r.currency !== 'USD';
	return false;
}

/** 현재가는 가격 기록 통화로 보인다(불일치면 그 통화 그대로). */
export function priceText(r: Pick<PortfolioRow, 'price' | 'price_currency' | 'currency'>): string {
	const ccy: Currency =
		r.price_currency === 'USD' || r.price_currency === 'KRW' ? r.price_currency : r.currency;
	return unitText(r.price, ccy);
}

/** 수익률(평균 단가 대비 %): 보유 행만, 가격 통화가 다르면 계산하지 않는다. */
export function rowReturnPct(
	r: Pick<PortfolioRow, 'status' | 'price' | 'avg_price' | 'price_currency' | 'currency'>
): number | null {
	if (r.status !== 'holding') return null;
	if (r.price_currency != null && r.price_currency !== r.currency) return null;
	return returnPct(r);
}

/** 비중(%): 평가금액 있는 보유 행만. */
export function rowWeightPct(
	r: Pick<PortfolioRow, 'status' | 'value_krw'>,
	totalKrw: number | null
): number | null {
	if (r.status !== 'holding' || r.value_krw == null || totalKrw == null || !(totalKrw > 0)) {
		return null;
	}
	return (r.value_krw / totalKrw) * 100;
}

/** 메모 첫 줄(감시 가격 근거 등). 비어 있으면 null. */
export function memoLine(memo: string | null | undefined): string | null {
	const line = (memo ?? '').split(/\r?\n/).find((l) => l.trim() !== '');
	return line ? line.trim() : null;
}
