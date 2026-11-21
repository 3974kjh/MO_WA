/**
 * FE-06 매매일지 작성·수정 폼 검사(화면과 서버 액션이 같은 함수를 쓴다).
 *
 * - buy/sell: 종목·가격·수량·통화 필수(R-VAL-J02, J03). 가격에는 통화가 있어야 한다(R-VAL-J05).
 * - 수량 단위(R-VAL-M03): 주식·ETF 정수, 현금 소수 2자리. 통화가 종목 시장의 기본 통화와 다르면 주의(R-VAL-M01, 저장은 막지 않음).
 * - tickers[](Q-16): instruments에 있는 코드만(R-VAL-C04, 최대 30). buy/sell은 종목 코드를 tickers[]에 함께 넣는다
 *   (FE-10 종목 필터가 tickers[]만 본다 — BE-09 MCP 경로와 같은 규칙).
 * - 일반 화면에는 규칙 번호를 보이지 않는다(용어집 v1.3 병기 방침). 오류마다 `rule`은 데이터로만 싣는다.
 */
import { parseQty } from '$lib/schemas/qty';
import { JOURNAL_TYPES, type JournalType } from '$lib/routing/listQuery';
import {
	JOURNAL_STATES,
	type InstrumentOption,
	type JournalCurrency,
	type JournalState
} from './view';

export const JOURNAL_TITLE_MAX = 200;
export const JOURNAL_TICKERS_MAX = 30;
export const JOURNAL_CURRENCIES = ['KRW', 'USD'] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_URL_RE = /^https?:\/\/\S+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const US_MARKETS = new Set(['NASDAQ', 'NYSE', 'NYSEARCA', 'AMEX']);

export type JournalField =
	| 'entry_date'
	| 'kind'
	| 'state'
	| 'title'
	| 'instrument_id'
	| 'tickers'
	| 'price'
	| 'qty'
	| 'currency'
	| 'memo_md'
	| 'source_url'
	| 'report_id';

export type FormIssue = { field: JournalField; rule: string; message: string };

/** 폼 원본 값(문자열). FormData와 화면 상태가 같은 모양을 쓴다. */
export type JournalFormInput = {
	entry_date: string;
	kind: string;
	state: string;
	title: string;
	instrument_id: string;
	tickers: string[];
	price: string;
	qty: string;
	currency: string;
	memo_md: string;
	source_url: string;
	report_id: string;
};

/** 저장할 열(서버가 owner_id·source_bot_id를 채운다). */
export type JournalFormValues = {
	entry_date: string;
	kind: JournalType;
	state: JournalState;
	title: string;
	instrument_id: string | null;
	tickers: string[];
	price: number | null;
	qty: number | null;
	currency: JournalCurrency | null;
	memo_md: string | null;
	source_url: string | null;
	report_id: string | null;
};

export type JournalFormResult =
	| { ok: true; values: JournalFormValues; warnings: FormIssue[] }
	| { ok: false; errors: FormIssue[]; warnings: FormIssue[] };

export function isTradeKind(kind: string): kind is 'buy' | 'sell' {
	return kind === 'buy' || kind === 'sell';
}

/** 종목 시장의 기본 통화(KRX → KRW, 미국 거래소 → USD). 모르는 시장은 null. */
export function marketCurrency(market: string | null | undefined): JournalCurrency | null {
	if (!market) return null;
	if (market === 'KRX') return 'KRW';
	if (US_MARKETS.has(market)) return 'USD';
	return null;
}

/** 수량 입력 step(R-VAL-M03): 주식·ETF 1, 현금 0.01, 그 밖은 any. */
export function qtyStep(assetType: InstrumentOption['asset_type'] | null | undefined): string {
	if (assetType === 'stock' || assetType === 'etf') return '1';
	if (assetType === 'cash') return '0.01';
	return 'any';
}

export function emptyJournalForm(today: string): JournalFormInput {
	return {
		entry_date: today,
		kind: 'thought',
		state: 'pending',
		title: '',
		instrument_id: '',
		tickers: [],
		price: '',
		qty: '',
		currency: '',
		memo_md: '',
		source_url: '',
		report_id: ''
	};
}

export function journalFormFromItem(item: {
	entry_date: string;
	kind: string;
	state: string;
	title: string;
	instrument_id: string | null;
	instrument_ticker?: string | null;
	tickers: string[];
	price: number | null;
	qty: number | null;
	currency: string | null;
	memo_md: string | null;
	source_url: string | null;
	report_id: string | null;
}): JournalFormInput {
	return {
		entry_date: item.entry_date,
		kind: item.kind,
		state: item.state,
		title: item.title,
		instrument_id: item.instrument_id ?? '',
		// 종목 코드는 '종목' 칸이 맡는다(저장할 때 다시 붙인다).
		tickers: item.tickers.filter((t) => t !== item.instrument_ticker),
		price: item.price == null ? '' : String(item.price),
		qty: item.qty == null ? '' : String(item.qty),
		currency: item.currency ?? '',
		memo_md: item.memo_md ?? '',
		source_url: item.source_url ?? '',
		report_id: item.report_id ?? ''
	};
}

const TEXT_FIELDS = [
	'entry_date',
	'kind',
	'state',
	'title',
	'instrument_id',
	'price',
	'qty',
	'currency',
	'memo_md',
	'source_url',
	'report_id'
] as const;

export function journalFormFromFormData(form: FormData): JournalFormInput {
	const get = (k: string) => {
		const v = form.get(k);
		return typeof v === 'string' ? v : '';
	};
	const out = {} as Record<(typeof TEXT_FIELDS)[number], string>;
	for (const k of TEXT_FIELDS) out[k] = get(k);
	const tickers = form
		.getAll('tickers')
		.filter((v): v is string => typeof v === 'string')
		.flatMap((v) => v.split(','));
	return { ...out, tickers };
}

/**
 * `1,234.5` → 1234.5. 빈 값은 null, 숫자가 아니면 NaN.
 * `<input type=number bind:value>`는 number나 null을 넣으므로 문자열로 바꿔 읽는다.
 */
function parseNumber(raw: string | number | null | undefined): number | null {
	const s = String(raw ?? '').replace(/[,\s]/g, '');
	if (s === '') return null;
	if (!/^\d+(\.\d+)?$/.test(s)) return Number.NaN;
	return Number(s);
}

function isIsoDate(v: string): boolean {
	if (!DATE_RE.test(v)) return false;
	const ms = Date.parse(`${v}T00:00:00Z`);
	return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === v;
}

function charCount(s: string): number {
	return [...s].length;
}

/**
 * 폼 검사. instruments는 사용자 종목 전체(보관 포함 — 기존 행을 고칠 때 보관된 종목도 유지한다).
 * 새로 고르는 종목 후보에서 보관된 종목을 빼는 일은 화면이 한다.
 */
export function validateJournalForm(
	input: JournalFormInput,
	instruments: readonly InstrumentOption[]
): JournalFormResult {
	const errors: FormIssue[] = [];
	const warnings: FormIssue[] = [];
	const err = (field: JournalField, rule: string, message: string) =>
		errors.push({ field, rule, message });

	const entry_date = input.entry_date.trim();
	if (!isIsoDate(entry_date)) err('entry_date', 'R-VAL-T01', '날짜를 골라 주세요.');

	const kind = input.kind as JournalType;
	if (!(JOURNAL_TYPES as readonly string[]).includes(kind))
		err('kind', 'R-VAL-J01', '구분을 골라 주세요.');
	const state = input.state as JournalState;
	if (!(JOURNAL_STATES as readonly string[]).includes(state))
		err('state', 'R-VAL-J01', '상태를 골라 주세요.');

	const title = input.title.trim();
	if (charCount(title) < 1) err('title', 'R-VAL-S05', '제목을 입력해 주세요.');
	else if (charCount(title) > JOURNAL_TITLE_MAX)
		err('title', 'R-VAL-S05', `제목은 ${JOURNAL_TITLE_MAX}자까지 쓸 수 있어요.`);

	const trade = isTradeKind(kind);
	const byId = new Map(instruments.map((i) => [i.id, i]));
	const known = new Set(instruments.map((i) => i.ticker));

	const instrumentId = input.instrument_id.trim();
	const instrument = instrumentId ? (byId.get(instrumentId) ?? null) : null;
	if (instrumentId && !instrument)
		err('instrument_id', 'R-VAL-J03', '목록에 있는 종목을 골라 주세요.');
	else if (trade && !instrument) err('instrument_id', 'R-VAL-J02', '매수·매도는 종목이 필요해요.');

	const price = parseNumber(input.price);
	if (price !== null && !(Number.isFinite(price) && price > 0))
		err('price', 'R-VAL-J05', '가격은 0보다 큰 숫자로 입력해 주세요.');
	else if (trade && price === null) err('price', 'R-VAL-J02', '매수·매도는 가격이 필요해요.');

	const qty = parseNumber(input.qty);
	if (qty !== null && !(Number.isFinite(qty) && qty > 0))
		err('qty', 'R-VAL-J05', '수량은 0보다 큰 숫자로 입력해 주세요.');
	else if (trade && qty === null) err('qty', 'R-VAL-J02', '매수·매도는 수량이 필요해요.');
	else if (qty !== null && instrument && !parseQty(instrument.asset_type, qty).success) {
		err(
			'qty',
			'R-VAL-M03',
			instrument.asset_type === 'cash'
				? '현금 수량은 소수 둘째 자리까지 쓸 수 있어요.'
				: '주식·ETF 수량은 정수로 입력해 주세요.'
		);
	}

	const currencyRaw = input.currency.trim();
	let currency: JournalCurrency | null = null;
	if (currencyRaw) {
		if ((JOURNAL_CURRENCIES as readonly string[]).includes(currencyRaw))
			currency = currencyRaw as JournalCurrency;
		else err('currency', 'R-VAL-J05', '통화를 골라 주세요.');
	} else if (trade) err('currency', 'R-VAL-J02', '매수·매도는 통화가 필요해요.');
	else if (price !== null && Number.isFinite(price))
		err('currency', 'R-VAL-J05', '가격을 쓰면 통화도 골라 주세요.');

	const expected = instrument ? marketCurrency(instrument.market) : null;
	if (currency && expected && currency !== expected) {
		warnings.push({
			field: 'currency',
			rule: 'R-VAL-M01',
			message: `이 종목의 시장 통화(${expected})와 달라요.`
		});
	}

	const tickers: string[] = [];
	for (const raw of input.tickers) {
		const t = raw.trim();
		if (t && !tickers.includes(t)) tickers.push(t);
	}
	for (const t of tickers) {
		if (!known.has(t)) err('tickers', 'R-VAL-C04', `종목 목록에 없는 코드예요: ${t}`);
	}
	if (trade && instrument && !tickers.includes(instrument.ticker))
		tickers.unshift(instrument.ticker);
	if (tickers.length > JOURNAL_TICKERS_MAX)
		err('tickers', 'R-VAL-C04', `종목은 ${JOURNAL_TICKERS_MAX}개까지 연결할 수 있어요.`);

	const source = input.source_url.trim();
	if (source && !SOURCE_URL_RE.test(source))
		err('source_url', 'R-VAL-S04', 'http:// 또는 https://로 시작하는 주소를 입력해 주세요.');

	const reportId = input.report_id.trim();
	if (reportId && !UUID_RE.test(reportId))
		err('report_id', 'R-VAL-J04', '목록에 있는 리포트를 골라 주세요.');

	if (errors.length > 0) return { ok: false, errors, warnings };
	return {
		ok: true,
		warnings,
		values: {
			entry_date,
			kind,
			state,
			title,
			instrument_id: instrument?.id ?? null,
			tickers,
			price,
			qty,
			currency,
			memo_md: input.memo_md.trim() === '' ? null : input.memo_md,
			source_url: source || null,
			report_id: reportId || null
		}
	};
}

/** 필드별 첫 오류(화면 aria-describedby용). */
export function firstIssueByField(
	issues: readonly FormIssue[]
): Partial<Record<JournalField, FormIssue>> {
	const out: Partial<Record<JournalField, FormIssue>> = {};
	for (const i of issues) if (!out[i.field]) out[i.field] = i;
	return out;
}

/** R-PERM-02: 매수·매도 기록은 보유 기록을 바꾸지 않는다. 저장 뒤 안내 문구. */
export const JOURNAL_SAVED_TRADE_NOTICE = '저장했어요 · 포지션 반영은 변경 요청에서 해요';
export const JOURNAL_SAVED_NOTICE = '저장했어요';
