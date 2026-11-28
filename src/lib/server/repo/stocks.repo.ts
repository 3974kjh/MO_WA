/**
 * FE-11 종목 보드·상세·분석 리포트 읽기(사용자 세션 RLS, owner 조건 강제). 쓰기 경로 없음.
 * 새 RPC·권한·마이그레이션 없이 기존 테이블(instruments·positions·price_snapshots·reports·
 * targets_valuation·journal_entries)만 읽는다.
 */
import type { RepoClient } from './client';
import { fromRepo } from './db';
import { requireOwnerId, withOwnerFilter } from './owner';

type Res<T> = Promise<{ data: T; error: Error | null }>;

export type StockInstrument = {
	id: string;
	ticker: string;
	name: string;
	market: string;
	asset_type: string;
	is_watchlist: boolean;
};

const INSTRUMENT_COLUMNS = 'id, ticker, name, market, asset_type, is_watchlist';

/** 보드 대상 종목: 보관 안 된 stock·etf(결정 3). */
export async function listStockInstruments(repo: RepoClient): Res<StockInstrument[]> {
	let q = fromRepo(repo, 'instruments')
		.select(INSTRUMENT_COLUMNS)
		.is('archived_at', null)
		.in('asset_type', ['stock', 'etf'])
		.order('name', { ascending: true });
	q = withOwnerFilter(q, requireOwnerId(repo));
	const { data, error } = await q;
	return { data: (data ?? []) as StockInstrument[], error: error as Error | null };
}

/** 상세: 코드 하나(보관 여부 포함, 보관이면 호출부가 404). */
export async function getStockInstrument(
	repo: RepoClient,
	ticker: string
): Res<(StockInstrument & { archived_at: string | null }) | null> {
	let q = fromRepo(repo, 'instruments')
		.select(`${INSTRUMENT_COLUMNS}, archived_at`)
		.eq('ticker', ticker);
	q = withOwnerFilter(q, requireOwnerId(repo));
	const { data, error } = await q.maybeSingle();
	return {
		data: (data as (StockInstrument & { archived_at: string | null }) | null) ?? null,
		error: error as Error | null
	};
}

/** 분석 리포트 '← 종목' 이름 표시용(코드 → 이름). */
export async function listInstrumentNamesByTicker(
	repo: RepoClient,
	tickers: string[]
): Res<Array<{ ticker: string; name: string }>> {
	if (tickers.length === 0) return { data: [], error: null };
	let q = fromRepo(repo, 'instruments').select('ticker, name').in('ticker', tickers);
	q = withOwnerFilter(q, requireOwnerId(repo));
	const { data, error } = await q;
	return {
		data: (data ?? []) as Array<{ ticker: string; name: string }>,
		error: error as Error | null
	};
}

export type StockQuote = {
	instrument_id: string;
	as_of: string;
	close: number;
	change_pct: number | null;
	currency: string;
};

/** 종목별 최신 시세 1건(등락 포함). */
export async function listLatestQuotes(
	repo: RepoClient,
	instrumentIds: string[]
): Res<StockQuote[]> {
	if (instrumentIds.length === 0) return { data: [], error: null };
	let q = fromRepo(repo, 'price_snapshots')
		.select('instrument_id, as_of, close, change_pct, currency')
		.in('instrument_id', instrumentIds)
		.order('as_of', { ascending: false });
	q = withOwnerFilter(q, requireOwnerId(repo));
	const { data, error } = await q;
	if (error) return { data: [], error: error as Error };
	const seen = new Set<string>();
	const out: StockQuote[] = [];
	for (const r of (data ?? []) as StockQuote[]) {
		if (seen.has(r.instrument_id)) continue;
		seen.add(r.instrument_id);
		out.push(r);
	}
	return { data: out, error: null };
}

export type QuotePoint = StockQuote & {
	foreign_net_buy: number | null;
	inst_net_buy: number | null;
};

export const QUOTE_SERIES_MAX = 260;

/** 상세 시세·수급: 최근 기록 QUOTE_SERIES_MAX건(오래된 순으로 돌려준다). */
export async function listQuoteSeries(repo: RepoClient, instrumentId: string): Res<QuotePoint[]> {
	let q = fromRepo(repo, 'price_snapshots')
		.select('instrument_id, as_of, close, change_pct, currency, foreign_net_buy, inst_net_buy')
		.eq('instrument_id', instrumentId)
		.order('as_of', { ascending: false })
		.limit(QUOTE_SERIES_MAX);
	q = withOwnerFilter(q, requireOwnerId(repo));
	const { data, error } = await q;
	return { data: ((data ?? []) as QuotePoint[]).toReversed(), error: error as Error | null };
}

export type StockPosition = {
	id: string;
	instrument_id: string;
	status: string;
	currency: 'KRW' | 'USD';
	qty: number | null;
	avg_price: number | null;
	breakeven: number | null;
	trigger_price: number | null;
	trigger_direction: 'below' | 'above';
	watch_only: boolean;
	memo: string | null;
	base_at: string | null;
};

/** 보관 안 된 보유·매수 계획 포지션(종목 하나 또는 전체). */
export async function listStockPositions(
	repo: RepoClient,
	instrumentId?: string
): Res<StockPosition[]> {
	let q = fromRepo(repo, 'positions')
		.select(
			'id, instrument_id, status, currency, qty, avg_price, breakeven, trigger_price, trigger_direction, watch_only, memo, base_at'
		)
		.is('archived_at', null)
		.in('status', ['holding', 'planned']);
	if (instrumentId) q = q.eq('instrument_id', instrumentId);
	q = withOwnerFilter(q, requireOwnerId(repo));
	const { data, error } = await q;
	return { data: (data ?? []) as StockPosition[], error: error as Error | null };
}

export type EquityReportLite = {
	id: string;
	slug: string;
	title: string;
	subtype: string | null;
	status: string;
	report_date: string;
	tickers: string[];
};

export const EQUITY_REPORTS_MAX = 200;

/** 기업분석·매수 계획서(보관 제외), 최신 날짜순. ticker를 주면 그 종목이 든 것만. */
export async function listEquityReports(
	repo: RepoClient,
	ticker?: string
): Res<Array<EquityReportLite & { meta?: Record<string, unknown> }>> {
	let q = fromRepo(repo, 'reports')
		// meta(종목 메모)는 종목 하나를 볼 때만 받는다(보드는 배지만 쓴다).
		.select(`id, slug, title, subtype, status, report_date, tickers${ticker ? ', meta' : ''}`)
		.eq('kind', 'equity_analysis')
		.is('archived_at', null);
	if (ticker) q = q.contains('tickers', [ticker]);
	q = withOwnerFilter(q, requireOwnerId(repo));
	const { data, error } = await q
		.order('report_date', { ascending: false })
		.limit(EQUITY_REPORTS_MAX);
	return {
		data: (data ?? []) as unknown as Array<EquityReportLite & { meta?: Record<string, unknown> }>,
		error: error as Error | null
	};
}

export type TargetRow = {
	as_of: string;
	target_price: number | null;
	currency: 'KRW' | 'USD';
	opinion: 'buy' | 'hold' | 'sell';
	source: 'internal' | 'broker';
	source_name: string;
	note: string | null;
	report_id: string;
};

export async function listTargetHistory(repo: RepoClient, instrumentId: string): Res<TargetRow[]> {
	let q = fromRepo(repo, 'targets_valuation')
		.select('as_of, target_price, currency, opinion, source, source_name, note, report_id')
		.eq('instrument_id', instrumentId)
		.order('as_of', { ascending: false })
		.limit(20);
	q = withOwnerFilter(q, requireOwnerId(repo));
	const { data, error } = await q;
	return { data: (data ?? []) as TargetRow[], error: error as Error | null };
}

export type MentionRow = {
	id: string;
	slug: string;
	kind: string;
	report_date: string;
	title: string;
};

/** 브리핑 언급: tickers에 이 코드가 든 데일리 브리핑 최근 5건. */
export async function listBriefingMentions(repo: RepoClient, ticker: string): Res<MentionRow[]> {
	let q = fromRepo(repo, 'reports')
		.select('id, slug, kind, report_date, title')
		.eq('kind', 'daily_brief')
		.is('archived_at', null)
		.contains('tickers', [ticker]);
	q = withOwnerFilter(q, requireOwnerId(repo));
	const { data, error } = await q.order('report_date', { ascending: false }).limit(5);
	return { data: (data ?? []) as MentionRow[], error: error as Error | null };
}

export type JournalMention = {
	id: string;
	entry_date: string;
	kind: string;
	state: string;
	title: string;
};

/** 매매일지: tickers에 이 코드가 든 최근 3건 + 전체 건수. */
export async function listJournalMentions(
	repo: RepoClient,
	ticker: string
): Res<{ items: JournalMention[]; total: number }> {
	let q = fromRepo(repo, 'journal_entries')
		.select('id, entry_date, kind, state, title', { count: 'exact' })
		.is('archived_at', null)
		.contains('tickers', [ticker]);
	q = withOwnerFilter(q, requireOwnerId(repo));
	const { data, error, count } = await q.order('entry_date', { ascending: false }).limit(3);
	const items = (data ?? []) as JournalMention[];
	return { data: { items, total: count ?? items.length }, error: error as Error | null };
}

export type AnalysisMeta = EquityReportLite & {
	summary: string | null;
	version: number;
	generated_at: string | null;
};

/**
 * 분석 리포트 하나(kind=equity_analysis, 보관 제외). slug는 날짜가 달라 겹칠 수 있다.
 * 같은 slug면 report_date가 가장 최신인 1건을 쓴다(PM 결정 2026-11-28 확정). 본문은 받지 않는다(렌더 캐시는 따로 읽음).
 */
export async function getEquityReportBySlug(
	repo: RepoClient,
	slug: string
): Res<AnalysisMeta | null> {
	let q = fromRepo(repo, 'reports')
		.select(
			'id, slug, title, subtype, status, report_date, tickers, summary, version, generated_at'
		)
		.eq('kind', 'equity_analysis')
		.eq('slug', slug)
		.is('archived_at', null);
	q = withOwnerFilter(q, requireOwnerId(repo));
	const { data, error } = await q.order('report_date', { ascending: false }).limit(1);
	return {
		data: ((data ?? [])[0] as AnalysisMeta | undefined) ?? null,
		error: error as Error | null
	};
}
