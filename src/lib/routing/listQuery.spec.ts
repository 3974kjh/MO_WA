import { describe, expect, it } from 'vitest';
import {
	briefingSearch,
	cleanText,
	isValidTag,
	journalSearch,
	monthRange,
	parseBriefingQuery,
	parseDetailMode,
	parseJournalQuery,
	stripInvalidTagSearch,
	withDetailMode
} from './listQuery';

const sp = (s: string) => new URLSearchParams(s);

describe('FE-10 브리핑 목록 ?q=&tag=&month=', () => {
	it('값을 읽고 정규화한다', () => {
		expect(parseBriefingQuery(sp('q=%20%20사이드카%20%20&tag=FOMC&month=2026-11'))).toEqual({
			q: '사이드카',
			tag: 'FOMC',
			month: '2026-11'
		});
	});
	it('없는 키·허용 밖 월은 빈 값', () => {
		expect(parseBriefingQuery(sp(''))).toEqual({ q: '', tag: '', month: '' });
		for (const m of ['2026-13', '2026-1', '11', '2026-11-01', 'x']) {
			expect(parseBriefingQuery(sp(`month=${m}`)).month).toBe('');
		}
	});
	it('빈 값은 URL에서 뺀다(?q= 같은 빈 키 없음)', () => {
		expect(briefingSearch({ q: '', tag: '', month: '' })).toBe('');
		expect(briefingSearch({ q: '   ' })).toBe('');
		expect(briefingSearch({ q: 'a', tag: '', month: '2026-10' })).toBe('?q=a&month=2026-10');
	});
	it('키 순서가 고정되고 왕복해도 같다', () => {
		const s = briefingSearch({ month: '2026-11', tag: '52주 저가', q: '코스피 & 환율' });
		expect(s).toBe(
			'?q=%EC%BD%94%EC%8A%A4%ED%94%BC+%26+%ED%99%98%EC%9C%A8&tag=52%EC%A3%BC+%EC%A0%80%EA%B0%80&month=2026-11'
		);
		expect(parseBriefingQuery(sp(s.slice(1)))).toEqual({
			q: '코스피 & 환율',
			tag: '52주 저가',
			month: '2026-11'
		});
	});
	it('page는 2 이상일 때만 남고 필터만 바꾸면 사라진다', () => {
		expect(briefingSearch({ q: 'a' }, { page: 3 })).toBe('?q=a&page=3');
		expect(briefingSearch({ q: 'a' }, { page: 1 })).toBe('?q=a');
		expect(briefingSearch({ q: 'a' })).toBe('?q=a');
	});
	it('검색어 길이·제어 문자를 제한한다', () => {
		expect(cleanText('a\u0000b\nc')).toBe('a b c');
		expect(cleanText('x'.repeat(500))).toHaveLength(100);
		expect(parseBriefingQuery(sp(`tag=${'t'.repeat(80)}`)).tag).toHaveLength(40);
	});
	it('폭 0 문자는 지운다(Nit)', () => {
		expect(cleanText('삼\u200b성\u200c전\u200d자\u2060\ufeff')).toBe('삼성전자');
		expect(cleanText('\u200b')).toBe('');
	});
});

describe('FE-10 Low-2 태그 허용 문자(문자·숫자·공백·._-)', () => {
	it('허용 문자만 있으면 통과', () => {
		for (const t of ['CPI', '52주 저가', 'S.E_A-1', '반도체', 'café']) {
			expect(isValidTag(t)).toBe(true);
			expect(parseBriefingQuery(sp(`tag=${encodeURIComponent(t)}`)).tag).toBe(t);
		}
	});
	it('PostgREST 배열·필터 문자가 섞이면 통째로 버린다', () => {
		for (const t of ['a,b', 'a}', '{a}', 'x"y', 'a\\b', 'a(b)', 'a*', '%', "it's", '-a', ' ']) {
			expect(isValidTag(t)).toBe(false);
			expect(parseBriefingQuery(sp(`tag=${encodeURIComponent(t)}`)).tag).toBe('');
		}
		expect(isValidTag('')).toBe(false);
		expect(isValidTag('t'.repeat(41))).toBe(false);
	});
	it('버려진 태그는 URL에도 남지 않는다', () => {
		expect(briefingSearch({ q: 'a', tag: 'a,b' })).toBe('?q=a');
	});
});

describe('FE-10 매매일지 목록 ?type=&ticker=&view=&q=', () => {
	it('값을 읽고 허용 밖 값은 버린다', () => {
		expect(parseJournalQuery(sp('type=buy&ticker=005930&view=tb&q=배당'))).toEqual({
			type: 'buy',
			ticker: '005930',
			view: 'tb',
			q: '배당'
		});
		expect(parseJournalQuery(sp('type=대기&ticker=a,b&view=grid'))).toEqual({
			type: '',
			ticker: '',
			view: 'tl',
			q: ''
		});
	});
	it('BRK.B 같은 점 포함 종목 코드는 허용', () => {
		expect(parseJournalQuery(sp('ticker=BRK.B')).ticker).toBe('BRK.B');
		expect(parseJournalQuery(sp('ticker=.x')).ticker).toBe('');
	});
	it('기본 보기(tl)와 빈 값은 URL에서 뺀다', () => {
		expect(journalSearch({ type: '', ticker: '', view: 'tl', q: '' })).toBe('');
		expect(journalSearch({ view: 'tb' })).toBe('?view=tb');
		expect(journalSearch({ q: '삼성', type: 'sell', ticker: 'NVDA', view: 'tl' })).toBe(
			'?type=sell&ticker=NVDA&q=%EC%82%BC%EC%84%B1'
		);
	});
	it('왕복해도 같다', () => {
		const q = { type: 'review', ticker: 'GOOGL', view: 'tb', q: '손절 기준' } as const;
		expect(parseJournalQuery(sp(journalSearch(q).slice(1)))).toEqual(q);
	});
});

describe('FE-10 상세 ?mode=', () => {
	it('summary가 기본이고 detail만 인정한다', () => {
		expect(parseDetailMode(sp(''))).toBe('summary');
		expect(parseDetailMode(sp('mode=detail'))).toBe('detail');
		expect(parseDetailMode(sp('mode=full'))).toBe('summary');
	});
	it('기본값이면 키를 빼고 다른 쿼리는 지킨다', () => {
		expect(withDetailMode(sp('mode=detail'), 'summary')).toBe('');
		expect(withDetailMode(sp('x=1'), 'detail')).toBe('?x=1&mode=detail');
		expect(withDetailMode(sp('x=1&mode=detail'), 'summary')).toBe('?x=1');
	});
});

describe('monthRange', () => {
	it('그 달 1일 ~ 다음 달 1일(연말 넘김 포함)', () => {
		expect(monthRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-12-01' });
		expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2027-01-01' });
		expect(monthRange('bad')).toBeNull();
	});
});

describe('FE-10 stripInvalidTagSearch', () => {
	it('tag 없음·허용된 tag는 null', () => {
		expect(stripInvalidTagSearch(sp(''))).toBeNull();
		expect(stripInvalidTagSearch(sp('q=a'))).toBeNull();
		expect(stripInvalidTagSearch(sp('tag=CPI&q=a'))).toBeNull();
	});
	it('허용 밖 tag만 제거하고 나머지는 유지', () => {
		expect(stripInvalidTagSearch(sp('tag=a%2Cb&q=x&page=2'))).toBe('?q=x&page=2');
		expect(stripInvalidTagSearch(sp('tag=%3Cscript%3E'))).toBe('');
		expect(stripInvalidTagSearch(sp('tag='))).toBe('');
		expect(stripInvalidTagSearch(sp('tag=&q=x'))).toBe('?q=x');
		expect(stripInvalidTagSearch(sp('tag=%22%22'))).toBe('');
	});
});
