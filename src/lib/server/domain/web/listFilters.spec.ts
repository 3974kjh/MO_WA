import { describe, expect, it } from 'vitest';
import {
	applyBriefingFilter,
	applyJournalFilter,
	ilikeAnyOf,
	ilikeValue,
	tagArrayLiteral
} from './listFilters';

/** 호출을 기록하는 가짜 PostgREST 빌더 */
function recorder() {
	const calls: [string, ...unknown[]][] = [];
	const q = {
		calls,
		eq: (...a: unknown[]) => (calls.push(['eq', ...a]), q),
		or: (...a: unknown[]) => (calls.push(['or', ...a]), q),
		contains: (...a: unknown[]) => (calls.push(['contains', ...a]), q),
		gte: (...a: unknown[]) => (calls.push(['gte', ...a]), q),
		lt: (...a: unknown[]) => (calls.push(['lt', ...a]), q)
	};
	return q;
}

describe('FE-10 검색어 → or() 값', () => {
	it('큰따옴표로 감싸고 LIKE 와일드카드를 붙인다', () => {
		expect(ilikeValue('사이드카')).toBe('"%사이드카%"');
		expect(ilikeValue('11/20 코스피')).toBe('"%11/20 코스피%"');
	});
	it('PostgREST 예약 문자·LIKE 와일드카드·따옴표를 지운다', () => {
		expect(ilikeValue('a,title.eq.x)')).toBe('"%a title.eq.x%"');
		expect(ilikeValue('"%_*\\:')).toBeNull();
		// Nit: 작은따옴표는 큰따옴표 값 안에서 의미가 없어 그대로 둔다.
		expect(ilikeValue("it's")).toBe('"%it\'s%"');
		expect(ilikeAnyOf(['headline', 'title'], 'a),owner_id.neq.(b')).toBe(
			'headline.ilike."%a owner id.neq. b%",title.ilike."%a owner id.neq. b%"'
		);
	});
});

describe('applyBriefingFilter', () => {
	it('빈 필터는 아무 조건도 붙이지 않는다', () => {
		const q = recorder();
		applyBriefingFilter(q, { q: '', tag: '', month: '' });
		applyBriefingFilter(q, undefined);
		expect(q.calls).toEqual([]);
	});
	it('q → headline/title ilike, tag → contains, month → 범위', () => {
		const q = recorder();
		applyBriefingFilter(q, { q: 'FOMC', tag: 'CPI', month: '2026-12' });
		expect(q.calls).toEqual([
			['or', 'headline.ilike."%FOMC%",title.ilike."%FOMC%"'],
			['contains', 'tags', '{"CPI"}'],
			['gte', 'report_date', '2026-12-01'],
			['lt', 'report_date', '2027-01-01']
		]);
	});
});

describe('FE-10 Low-2 tag → 배열 리터럴', () => {
	it('허용 문자는 원소 하나짜리 따옴표 리터럴', () => {
		expect(tagArrayLiteral('CPI')).toBe('{"CPI"}');
		expect(tagArrayLiteral('52주 저가')).toBe('{"52주 저가"}');
	});
	it('허용 밖·빈 값은 null이고 필터를 붙이지 않는다', () => {
		for (const t of ['a,b', 'a}', 'x"y', '{a}', 'a\\b', '', undefined]) {
			expect(tagArrayLiteral(t)).toBeNull();
			const q = recorder();
			applyBriefingFilter(q, { q: '', tag: t, month: '' });
			expect(q.calls).toEqual([]);
		}
	});
});

describe('applyJournalFilter', () => {
	it('type → kind, ticker → tickers contains, q → title/memo_md', () => {
		const q = recorder();
		applyJournalFilter(q, { type: 'buy', ticker: 'NVDA', q: '추가' });
		expect(q.calls).toEqual([
			['eq', 'kind', 'buy'],
			['contains', 'tickers', ['NVDA']],
			['or', 'title.ilike."%추가%",memo_md.ilike."%추가%"']
		]);
	});
	it('빈 필터는 조건 없음', () => {
		const q = recorder();
		applyJournalFilter(q, { type: '', ticker: '', q: '' });
		expect(q.calls).toEqual([]);
	});
});
