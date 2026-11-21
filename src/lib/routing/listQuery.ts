/**
 * FE-10 목록 검색·URL 상태: 쿼리 파싱·직렬화(서버 load와 화면이 함께 쓴다).
 *
 * - 브리핑 목록 `?q=&tag=&month=`
 * - 매매일지 목록 `?type=&ticker=&view=&q=`
 * - 상세 `?mode=` (summary 기본, detail)
 *
 * 빈 값·기본값·허용 밖 값은 URL에서 뺀다(`?q=`처럼 빈 키를 남기지 않는다).
 * 필터가 바뀌면 `page`는 1로 돌아가므로 함께 뺀다.
 */

export const SEARCH_DEBOUNCE_MS = 200;
export const QUERY_TEXT_MAX = 100;
export const TAG_MAX = 40;

export const JOURNAL_TYPES = ['buy', 'sell', 'thought', 'plan', 'review'] as const;
export type JournalType = (typeof JOURNAL_TYPES)[number];

/** 일지 구분 라벨(시안 journal.html). G-10 상태 라벨(대기·실행·보류·종료)과는 별개. */
export const JOURNAL_TYPE_LABEL: Record<JournalType, string> = {
	buy: '매수',
	sell: '매도',
	thought: '생각·판단',
	plan: '계획',
	review: '점검'
};

export const JOURNAL_VIEWS = ['tl', 'tb'] as const;
export type JournalView = (typeof JOURNAL_VIEWS)[number];
export const DEFAULT_JOURNAL_VIEW: JournalView = 'tl';

export const DETAIL_MODES = ['summary', 'detail'] as const;
export type DetailMode = (typeof DETAIL_MODES)[number];
export const DEFAULT_DETAIL_MODE: DetailMode = 'summary';

export type BriefingQuery = { q: string; tag: string; month: string };
export type JournalQuery = { type: JournalType | ''; ticker: string; view: JournalView; q: string };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const TICKER_RE = /^[A-Za-z0-9][A-Za-z0-9.-]{0,19}$/;
/**
 * 태그 허용 문자: 문자·숫자·공백·`.` `_` `-` (FE-10 Low-2).
 * PostgREST `cs.{…}` 배열 리터럴에서 의미가 있는 `,` `{` `}` `"` `\` 등은 들어올 수 없다.
 */
const TAG_RE = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._-]*$/u;

/** 정규화된 태그가 허용 문자만으로 이뤄졌는지(빈 값은 false). */
export function isValidTag(tag: string): boolean {
	return tag.length > 0 && tag.length <= TAG_MAX && TAG_RE.test(tag);
}

/** 앞뒤 공백 제거, 연속 공백 1칸, 제어 문자 제거, 길이 상한. */
export function cleanText(raw: string | null | undefined, max = QUERY_TEXT_MAX): string {
	if (!raw) return '';
	return (
		raw
			// eslint-disable-next-line no-control-regex
			.replace(/[\u0000-\u001f\u007f]/g, ' ')
			// 폭 0 문자(ZWSP·ZWNJ·ZWJ·WJ·BOM)는 보이지 않으므로 지운다.
			.replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, max)
			.trim()
	);
}

function oneOf<T extends string>(list: readonly T[], v: string | null): T | null {
	return v != null && (list as readonly string[]).includes(v) ? (v as T) : null;
}

export function parseBriefingQuery(sp: URLSearchParams): BriefingQuery {
	const month = sp.get('month') ?? '';
	const tag = cleanText(sp.get('tag'), TAG_MAX);
	return {
		q: cleanText(sp.get('q')),
		// 허용 밖 문자가 섞인 태그는 통째로 버린다(DB로 보내지 않는다).
		tag: isValidTag(tag) ? tag : '',
		month: MONTH_RE.test(month) ? month : ''
	};
}

export function parseJournalQuery(sp: URLSearchParams): JournalQuery {
	const ticker = (sp.get('ticker') ?? '').trim();
	return {
		type: oneOf(JOURNAL_TYPES, sp.get('type')) ?? '',
		ticker: TICKER_RE.test(ticker) ? ticker : '',
		view: oneOf(JOURNAL_VIEWS, sp.get('view')) ?? DEFAULT_JOURNAL_VIEW,
		q: cleanText(sp.get('q'))
	};
}

export function parseDetailMode(sp: URLSearchParams): DetailMode {
	return oneOf(DETAIL_MODES, sp.get('mode')) ?? DEFAULT_DETAIL_MODE;
}

/** 정해진 키 순서로 직렬화. 빈 값은 뺀다. 결과는 '' 또는 '?…'. */
function serialize(entries: [string, string | number | null | undefined][]): string {
	const sp = new URLSearchParams();
	for (const [k, v] of entries) {
		if (v == null || v === '') continue;
		sp.set(k, String(v));
	}
	const s = sp.toString();
	return s ? `?${s}` : '';
}

/** page는 2 이상일 때만 남긴다(필터 변경 시 호출부가 넘기지 않으면 1로 돌아간다). */
function pageEntry(page?: number): [string, number | null] {
	return ['page', page != null && Number.isInteger(page) && page > 1 ? page : null];
}

export function briefingSearch(
	query: Partial<BriefingQuery>,
	opts: { page?: number } = {}
): string {
	const n = parseBriefingQuery(
		new URLSearchParams(
			Object.entries(query).filter((e): e is [string, string] => typeof e[1] === 'string')
		)
	);
	return serialize([['q', n.q], ['tag', n.tag], ['month', n.month], pageEntry(opts.page)]);
}

export function journalSearch(query: Partial<JournalQuery>, opts: { page?: number } = {}): string {
	const n = parseJournalQuery(
		new URLSearchParams(
			Object.entries(query).filter((e): e is [string, string] => typeof e[1] === 'string')
		)
	);
	return serialize([
		['type', n.type],
		['ticker', n.ticker],
		['view', n.view === DEFAULT_JOURNAL_VIEW ? '' : n.view],
		['q', n.q],
		pageEntry(opts.page)
	]);
}

/** 상세 `?mode=`: 기본(summary)이면 키를 뺀다. 다른 쿼리는 그대로 둔다. */
export function withDetailMode(sp: URLSearchParams, mode: DetailMode): string {
	const next = new URLSearchParams(sp);
	if (mode === DEFAULT_DETAIL_MODE) next.delete('mode');
	else next.set('mode', mode);
	const s = next.toString();
	return s ? `?${s}` : '';
}

/** `YYYY-MM` → [그 달 1일, 다음 달 1일) 범위(report_date 필터용). */
export function monthRange(month: string): { from: string; to: string } | null {
	if (!MONTH_RE.test(month)) return null;
	const y = Number(month.slice(0, 4));
	const m = Number(month.slice(5, 7));
	const ny = m === 12 ? y + 1 : y;
	const nm = m === 12 ? 1 : m + 1;
	return { from: `${month}-01`, to: `${ny}-${String(nm).padStart(2, '0')}-01` };
}
