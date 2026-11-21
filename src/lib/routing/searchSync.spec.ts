/**
 * FE-10 Low-1: 검색 입력 ↔ URL 동기화. 실제 debounce와 createSearchSync를 화면과 같은 순서로 엮어
 * fake timer로 이동·load 도착 시점을 흉내 낸다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from './debounce';
import { SEARCH_DEBOUNCE_MS } from './listQuery';
import { createSearchSync } from './searchSync';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** 목록 화면 흉내: 입력창·디바운스·동기화·이동 기록. load 도착은 land()로 직접 일으킨다. */
function screen(initialQ = '') {
	const sync = createSearchSync();
	const navs: { q: string; replace: boolean }[] = [];
	const state = { input: initialQ, urlQ: initialQ };
	function navigate(next: { q?: string }, replace = false) {
		emit.cancel();
		if (next.q !== undefined) state.input = next.q;
		const q = next.q ?? state.input;
		sync.sent(q);
		navs.push({ q, replace });
	}
	const emit = debounce((v: string) => navigate({ q: v }, true), SEARCH_DEBOUNCE_MS);
	return {
		state,
		navs,
		sync,
		emit,
		type(v: string) {
			state.input = v;
			emit(v);
		},
		navigate,
		/** load가 끝나 URL q가 바뀌었다($effect.pre). */
		land(urlQ: string) {
			state.urlQ = urlQ;
			const v = sync.next(urlQ, state.input, emit.pending());
			if (v !== null) state.input = v;
		},
		/** 뒤로 가기(popstate): beforeNavigate → cancel·reset, 그 뒤 load 도착. */
		back(urlQ: string) {
			emit.cancel();
			sync.reset();
			this.land(urlQ);
		}
	};
}

describe('FE-10 Low-1 디바운스 경계', () => {
	it('199ms까지는 대기 중, 200ms에 한 번 보낸다', () => {
		const s = screen();
		s.type('삼');
		vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
		expect(s.emit.pending()).toBe(true);
		expect(s.navs).toEqual([]);
		vi.advanceTimersByTime(1);
		expect(s.emit.pending()).toBe(false);
		expect(s.navs).toEqual([{ q: '삼', replace: true }]);
	});
});

describe('FE-10 Low-1 입력 중에는 URL 동기화가 글자를 덮지 않는다', () => {
	it('이동 중 계속 입력 → 이전 q의 load가 끝나도 입력이 그대로', () => {
		const s = screen();
		s.type('삼성');
		vi.advanceTimersByTime(200); // q=삼성 이동 시작
		s.type('삼성전');
		s.land('삼성'); // 이전 이동의 load 도착(입력 대기 중)
		expect(s.state.input).toBe('삼성전');
		vi.advanceTimersByTime(200);
		expect(s.navs.map((n) => n.q)).toEqual(['삼성', '삼성전']);
		s.land('삼성전');
		expect(s.state.input).toBe('삼성전');
	});

	it('디바운스는 끝났지만 보낸 q의 load가 아직이면, 먼저 온 이전 load가 덮지 않는다', () => {
		const s = screen('a');
		s.type('ab');
		vi.advanceTimersByTime(200); // q=ab 이동 중
		s.land('a'); // 다른 이유(invalidate 등)로 이전 q의 load가 먼저 도착
		expect(s.state.input).toBe('ab');
		s.land('ab');
		expect(s.state.input).toBe('ab');
		// 기다림이 풀린 뒤에는 URL을 따른다.
		s.land('zz');
		expect(s.state.input).toBe('zz');
	});

	it('끝 공백 등 정규화 차이는 덮지 않는다', () => {
		const s = screen();
		s.type('코스피 ');
		vi.advanceTimersByTime(200);
		s.land('코스피');
		expect(s.state.input).toBe('코스피 ');
	});

	it('settled는 같은 q를 기다릴 때만 기다림을 푼다(실패·대체된 이동)', () => {
		const sync = createSearchSync();
		sync.sent('b');
		sync.settled('a');
		expect(sync.next('a', 'b', false)).toBeNull();
		sync.settled('b');
		expect(sync.next('a', 'b', false)).toBe('a');
	});
});

describe('FE-10 Low-1 다른 이동 전에 대기 중인 입력을 취소한다', () => {
	it('칩 클릭: 대기 중 디바운스를 취소하고 지금 글자를 같은 이동에 싣는다', () => {
		const s = screen();
		s.type('환율');
		vi.advanceTimersByTime(100);
		s.navigate({}); // 칩·select·보기 전환
		expect(s.navs).toEqual([{ q: '환율', replace: false }]);
		vi.advanceTimersByTime(1000);
		expect(s.navs).toHaveLength(1); // 200ms 뒤 이전 q가 덮어쓰지 않음
		s.land('환율');
		expect(s.state.input).toBe('환율');
	});

	it('필터 초기화: 대기 중 입력을 버리고 입력창도 비운다', () => {
		const s = screen('a');
		s.type('abc');
		s.navigate({ q: '' });
		expect(s.state.input).toBe('');
		vi.advanceTimersByTime(1000);
		expect(s.navs).toEqual([{ q: '', replace: false }]);
		s.land('');
		expect(s.state.input).toBe('');
	});

	it('뒤로 가기: 대기 중 입력을 버리고 이전 URL의 q를 따른다', () => {
		const s = screen('a');
		s.type('ab');
		vi.advanceTimersByTime(200); // q=ab
		s.land('ab');
		s.type('abc'); // 아직 안 보냄
		s.back('a');
		expect(s.state.input).toBe('a');
		vi.advanceTimersByTime(1000);
		expect(s.navs.map((n) => n.q)).toEqual(['ab']); // 취소된 'abc'는 보내지 않음
	});

	it('뒤로 가기는 우리가 기다리던 q도 버린다', () => {
		const s = screen('a');
		s.type('ab');
		vi.advanceTimersByTime(200); // q=ab 이동 중
		s.back('a');
		expect(s.state.input).toBe('a');
	});
});
