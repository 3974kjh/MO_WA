/**
 * FE-10: 목록 검색 필터 → PostgREST 조건. 값은 `$lib/routing/listQuery`에서 이미 정규화된 것을 받는다.
 *
 * `q`는 `.or()` 문자열에 들어가므로 PostgREST 예약 문자(`,` `(` `)` `"` `:` `\`)와
 * LIKE 와일드카드(`%` `_` `*`), 따옴표를 공백으로 바꾼 뒤 큰따옴표로 감싼다.
 * FE-04: 브리핑 q는 `reports.search_tsv` 전문 검색 + title(pg_trgm)/headline 부분 일치(briefingTextFilter).
 * 일지 q는 journal_entries에 tsvector 컬럼이 없어(마이그레이션 필요) title/memo_md ilike를 유지한다.
 */
import { monthRange, type BriefingQuery, type JournalQuery } from '$lib/routing/listQuery';

export type BriefingListFilter = Pick<BriefingQuery, 'q' | 'tag' | 'month'>;
export type JournalListFilter = Pick<JournalQuery, 'type' | 'ticker' | 'q'>;

/** 검색어 → `"%term%"`(or() 값). 남는 글자가 없으면 null. */
export function ilikeValue(q: string): string | null {
	const t = q
		.replace(/[%_*\\,()"':]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return t ? `"%${t}%"` : null;
}

/** `col1.ilike."%t%",col2.ilike."%t%"` — 하나라도 맞으면 통과. */
export function ilikeAnyOf(columns: readonly string[], q: string): string | null {
	const v = ilikeValue(q);
	if (!v) return null;
	return columns.map((c) => `${c}.ilike.${v}`).join(',');
}

/**
 * 브리핑 검색어(FE-04): `reports.search_tsv`(title·headline·summary·body_md, 'simple' 설정, GIN) 전문 검색과
 * 부분 일치(`title` — pg_trgm GIN 인덱스, `headline`)를 함께 건다. 하나라도 맞으면 통과.
 * 'simple' 사전은 한국어 조사를 떼지 않아 '사이드카가'처럼 붙은 단어는 전문 검색에 안 잡히므로 부분 일치를 남긴다.
 * 값은 ilikeValue()와 같은 규칙으로 예약 문자를 지운 뒤 큰따옴표로 감싼다(or() 주입 방지).
 */
export function briefingTextFilter(q: string): string | null {
	const v = ilikeValue(q);
	if (!v) return null;
	const term = v.slice(2, -2);
	return [`search_tsv.wfts(simple)."${term}"`, `title.ilike.${v}`, `headline.ilike.${v}`].join(',');
}

/** 필터 적용에 필요한 최소 빌더 모양(Supabase PostgrestFilterBuilder와 호환). */
export type FilterableQuery<Q> = {
	eq(col: string, v: string): Q;
	or(filters: string): Q;
	contains(col: string, v: string[]): Q;
	gte(col: string, v: string): Q;
	lt(col: string, v: string): Q;
};

export function applyBriefingFilter<Q extends FilterableQuery<Q>>(
	q: Q,
	f: Partial<BriefingListFilter> | undefined
): Q {
	if (!f) return q;
	let out = q;
	const text = f.q ? briefingTextFilter(f.q) : null;
	if (text) out = out.or(text);
	if (f.tag) out = out.contains('tags', [f.tag]);
	const range = f.month ? monthRange(f.month) : null;
	if (range) out = out.gte('report_date', range.from).lt('report_date', range.to);
	return out;
}

export function applyJournalFilter<Q extends FilterableQuery<Q>>(
	q: Q,
	f: Partial<JournalListFilter> | undefined
): Q {
	if (!f) return q;
	let out = q;
	if (f.type) out = out.eq('kind', f.type);
	if (f.ticker) out = out.contains('tickers', [f.ticker]);
	const text = f.q ? ilikeAnyOf(['title', 'memo_md'], f.q) : null;
	if (text) out = out.or(text);
	return out;
}
