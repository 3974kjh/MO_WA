/**
 * FE-06 매매일지 화면 모델(서버 load와 화면이 함께 쓴다).
 *
 * - 행 DTO: DB 행에서 화면에 필요한 열만 고른다(search_tsv·source_ref·owner_id는 내려보내지 않는다).
 * - 라벨(G-10, 용어집 v1.3): 구분 buy=매수 · sell=매도 · plan=계획 · thought=생각·판단 · review=점검,
 *   상태 pending=대기 · done=실행 · hold=보류 · closed=종료.
 * - 상세 URL: `/journal/[id]` + 목록 쿼리(?type=&ticker=&view=&q=&page=)를 그대로 싣는다.
 */
import {
	JOURNAL_TYPE_LABEL,
	JOURNAL_TYPES,
	journalSearch,
	type JournalQuery,
	type JournalType
} from '$lib/routing/listQuery';
import type { BadgeTone } from '$lib/components/ui/types';

export const JOURNAL_STATES = ['pending', 'done', 'hold', 'closed'] as const;
export type JournalState = (typeof JOURNAL_STATES)[number];

/** G-10 일지 상태 라벨 */
export const JOURNAL_STATE_LABEL: Record<JournalState, string> = {
	pending: '대기',
	done: '실행',
	hold: '보류',
	closed: '종료'
};

/** 시안 journal.html 배지 톤: 매수 up · 매도 down · 계획 warn · 생각·판단 info · 점검 중립 */
export const JOURNAL_KIND_TONE: Record<JournalType, BadgeTone> = {
	buy: 'up',
	sell: 'down',
	plan: 'warn',
	thought: 'info',
	review: 'default'
};

/** 색만으로 구분하지 않도록 매수·매도는 기호를 함께 쓴다(DS §7-7). */
export const JOURNAL_KIND_ICON: Partial<Record<JournalType, string>> = { buy: '▲', sell: '▼' };

export const JOURNAL_STATE_TONE: Record<JournalState, BadgeTone> = {
	pending: 'warn',
	done: 'ok',
	hold: 'info',
	closed: 'default'
};

export type JournalCurrency = 'KRW' | 'USD';

export type JournalItem = {
	id: string;
	entry_date: string;
	kind: JournalType;
	state: JournalState;
	title: string;
	tickers: string[];
	instrument_id: string | null;
	/** 종목 표시(코드). instrument_id가 가리키는 종목, 없으면 null */
	instrument_ticker: string | null;
	instrument_name: string | null;
	instrument_asset_type: InstrumentOption['asset_type'] | null;
	price: number | null;
	qty: number | null;
	breakeven: number | null;
	currency: JournalCurrency | null;
	memo_md: string | null;
	source_url: string | null;
	report_id: string | null;
	/** R-CLS-05: 봇이 쓴 행만 값이 있다(사용자 행은 null → 작성자 표시 없음). */
	bot: { id: string; name: string | null } | null;
};

export type InstrumentOption = {
	id: string;
	ticker: string;
	name: string;
	market: string;
	asset_type: 'stock' | 'etf' | 'bond' | 'cash';
	archived: boolean;
};

export type ReportOption = {
	id: string;
	kind: string;
	slug: string;
	report_date: string;
	title: string;
};

function isKind(v: unknown): v is JournalType {
	return typeof v === 'string' && (JOURNAL_TYPES as readonly string[]).includes(v);
}
function isState(v: unknown): v is JournalState {
	return typeof v === 'string' && (JOURNAL_STATES as readonly string[]).includes(v);
}
function num(v: unknown): number | null {
	if (v == null || v === '') return null;
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? n : null;
}
function str(v: unknown): string | null {
	return typeof v === 'string' && v !== '' ? v : null;
}

/** DB 행 → 화면 행. 알 수 없는 구분·상태 값은 버리지 않고 가장 가까운 기본값으로 보인다. */
export function toJournalItem(
	raw: Record<string, unknown>,
	ctx: {
		instruments?: ReadonlyMap<string, Pick<InstrumentOption, 'ticker' | 'name' | 'asset_type'>>;
		botNames?: ReadonlyMap<string, string>;
	} = {}
): JournalItem {
	const instrumentId = str(raw.instrument_id);
	const inst = instrumentId ? ctx.instruments?.get(instrumentId) : undefined;
	const botId = str(raw.source_bot_id);
	const currency = raw.currency === 'KRW' || raw.currency === 'USD' ? raw.currency : null;
	return {
		id: String(raw.id),
		entry_date: String(raw.entry_date ?? ''),
		kind: isKind(raw.kind) ? raw.kind : 'thought',
		state: isState(raw.state) ? raw.state : 'pending',
		title: String(raw.title ?? ''),
		tickers: Array.isArray(raw.tickers) ? raw.tickers.map(String) : [],
		instrument_id: instrumentId,
		instrument_ticker: inst?.ticker ?? null,
		instrument_name: inst?.name ?? null,
		instrument_asset_type: inst?.asset_type ?? null,
		price: num(raw.price),
		qty: num(raw.qty),
		breakeven: num(raw.breakeven),
		currency,
		memo_md: typeof raw.memo_md === 'string' ? raw.memo_md : null,
		source_url: str(raw.source_url),
		report_id: str(raw.report_id),
		bot: botId ? { id: botId, name: ctx.botNames?.get(botId) ?? null } : null
	};
}

/** 행에 붙는 종목 코드: instrument 코드 + tickers[] (중복 제거, 순서 유지). */
export function itemTickers(item: Pick<JournalItem, 'instrument_ticker' | 'tickers'>): string[] {
	const out: string[] = [];
	for (const t of [item.instrument_ticker, ...item.tickers]) {
		if (t && !out.includes(t)) out.push(t);
	}
	return out;
}

export type DayGroup = { date: string; items: JournalItem[] };

/** 타임라인: 날짜 구분선 위 날짜 헤더(목록 순서 유지, 같은 날은 한 묶음). */
export function groupByDate(items: readonly JournalItem[]): DayGroup[] {
	const out: DayGroup[] = [];
	for (const it of items) {
		const last = out[out.length - 1];
		if (last && last.date === it.entry_date) last.items.push(it);
		else out.push({ date: it.entry_date, items: [it] });
	}
	return out;
}

/** `2026-11-20` → `2026.11.20` */
export function dotDate(iso: string): string {
	return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.replace(/-/g, '.') : iso;
}

export type KindCounts = Record<JournalType, number> & { all: number };

export function emptyKindCounts(): KindCounts {
	return { all: 0, buy: 0, sell: 0, thought: 0, plan: 0, review: 0 };
}

/** kind 값 목록 → 칩 건수 */
export function countKinds(kinds: readonly unknown[]): KindCounts {
	const out = emptyKindCounts();
	for (const k of kinds) {
		out.all += 1;
		if (isKind(k)) out[k] += 1;
	}
	return out;
}

/** 목록 안의 이전/다음(목록 순서 = 최신순). 목록에 없으면 둘 다 null. */
export function neighbors(
	items: readonly Pick<JournalItem, 'id'>[],
	id: string | null
): { index: number; prev: string | null; next: string | null } {
	const index = id ? items.findIndex((i) => i.id === id) : -1;
	if (index < 0) return { index: -1, prev: null, next: null };
	return {
		index,
		prev: index > 0 ? items[index - 1].id : null,
		next: index < items.length - 1 ? items[index + 1].id : null
	};
}

/** 수량 표시: 주식·ETF는 'N주', 그 밖은 숫자만. */
export function qtyText(qty: number, assetType: InstrumentOption['asset_type'] | null): string {
	const n = qty.toLocaleString('ko-KR', { maximumFractionDigits: 6 });
	return assetType === 'stock' || assetType === 'etf' ? `${n}주` : n;
}

/** 목록 쿼리 + page를 직렬화('' 또는 '?…'). */
export function listSearch(query: JournalQuery, page: number): string {
	return journalSearch(query, { page });
}

/** 상세 경로(쿼리 포함). base는 resolve('/journal')처럼 만든 경로. */
export function detailPath(base: string, id: string, search: string): string {
	return `${base}/${encodeURIComponent(id)}${search}`;
}

export function kindLabel(k: JournalType): string {
	return JOURNAL_TYPE_LABEL[k];
}

/** 오늘 날짜(KST, R-SYS-02) `YYYY-MM-DD` — 새 일지 기본 날짜. */
export function kstToday(now: Date = new Date()): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Seoul',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(now);
}
