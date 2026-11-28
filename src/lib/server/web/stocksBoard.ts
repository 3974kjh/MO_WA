/**
 * FE-11 `/stocks` 보드 조립(순수 함수). 읽은 행만 묶고 값을 지어내지 않는다.
 * 결정 2(관심 = 미보유 중 계획·watch_only·is_watchlist), 결정 3(stock·etf만 — 호출부가 거른 종목만 넘긴다).
 */
import { computeDashboardValuation } from '$lib/server/domain/dashboard/valuation';
import type {
	EquityReportLite,
	StockInstrument,
	StockPosition,
	StockQuote
} from '$lib/server/repo';
import { stockKind, type StockKind } from '$lib/stocks/view';

export type BoardReport = Pick<EquityReportLite, 'slug' | 'subtype' | 'status' | 'report_date'>;

export type BoardRow = {
	ticker: string;
	name: string;
	market: string;
	kind: StockKind;
	currency: 'KRW' | 'USD';
	price: number | null;
	change_pct: number | null;
	as_of: string | null;
	qty: number | null;
	avg_price: number | null;
	value_krw: number | null;
	/** 보유 행은 보유 포지션, 관심 행은 계획 포지션의 감시 가격 */
	trigger_price: number | null;
	trigger_direction: 'below' | 'above';
	watch_only: boolean;
	planned: boolean;
	memo: string | null;
	report: BoardReport | null;
};

export function buildStockBoard(input: {
	instruments: readonly StockInstrument[];
	positions: readonly StockPosition[];
	quotes: readonly StockQuote[];
	reports: readonly EquityReportLite[];
	usdkrw: { value: number; as_of: string } | null;
}) {
	const quoteBy = new Map(input.quotes.map((q) => [q.instrument_id, q]));
	const posBy = new Map<string, { holding?: StockPosition; planned?: StockPosition }>();
	for (const p of input.positions) {
		const e = posBy.get(p.instrument_id) ?? {};
		if (p.status === 'holding') e.holding = p;
		else if (p.status === 'planned') e.planned = p;
		posBy.set(p.instrument_id, e);
	}
	const valuation = computeDashboardValuation({
		positions: input.positions,
		latestByInstrument: new Map(input.quotes.map((q) => [q.instrument_id, q])),
		positionInstrument: new Map(input.positions.map((p) => [p.id, p.instrument_id])),
		usdkrw: input.usdkrw
	});
	const valueBy = new Map(valuation.positions.map((v) => [v.id, v.valueKrw]));

	const rows: BoardRow[] = [];
	for (const i of input.instruments) {
		const { holding, planned } = posBy.get(i.id) ?? {};
		const kind = stockKind({
			holding: holding != null && (holding.qty ?? 0) > 0,
			planned: planned != null,
			watchOnly: Boolean(holding?.watch_only || planned?.watch_only),
			isWatchlist: i.is_watchlist
		});
		if (!kind) continue;
		const pos = kind === 'hold' ? holding! : planned;
		const q = quoteBy.get(i.id);
		const rep = input.reports.find((r) => r.tickers.includes(i.ticker));
		rows.push({
			ticker: i.ticker,
			name: i.name,
			market: i.market,
			kind,
			currency:
				pos?.currency ?? (q?.currency === 'USD' || (!q && i.market !== 'KRX') ? 'USD' : 'KRW'),
			price: q?.close ?? null,
			change_pct: q?.change_pct ?? null,
			as_of: q?.as_of ?? null,
			qty: kind === 'hold' ? (pos?.qty ?? null) : null,
			avg_price: kind === 'hold' ? (pos?.avg_price ?? null) : null,
			value_krw: kind === 'hold' ? (valueBy.get(pos!.id) ?? null) : null,
			trigger_price: pos?.trigger_price ?? null,
			trigger_direction: pos?.trigger_direction === 'above' ? 'above' : 'below',
			watch_only: Boolean(pos?.watch_only),
			planned: planned != null,
			memo: pos?.memo?.trim() || null,
			report: rep
				? { slug: rep.slug, subtype: rep.subtype, status: rep.status, report_date: rep.report_date }
				: null
		});
	}
	const nameBy = new Map(input.instruments.map((i) => [i.ticker, i.name]));
	const drafts = input.reports
		.filter((r) => r.subtype === 'buy_plan' && r.status === 'draft')
		.map((r) => nameBy.get(r.tickers[0] ?? '') ?? r.title);
	return { rows, drafts };
}
