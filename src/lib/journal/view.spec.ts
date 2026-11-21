import { describe, expect, it } from 'vitest';
import {
	countKinds,
	detailPath,
	dotDate,
	groupByDate,
	itemTickers,
	kstToday,
	neighbors,
	qtyText,
	toJournalItem
} from './view';

describe('FE-06 일지 화면 모델', () => {
	it('DB 행 → 화면 행: 필요한 열만, 사용자 행은 bot=null, 봇 행은 이름', () => {
		const user = toJournalItem({
			id: 'j1',
			entry_date: '2026-11-01',
			kind: 'buy',
			state: 'done',
			title: 't',
			tickers: ['A'],
			price: '12.5',
			currency: 'USD',
			search_tsv: "'x'",
			owner_id: 'u',
			source_ref: {},
			source_bot_id: null
		});
		expect(user.bot).toBeNull();
		expect(user.price).toBe(12.5);
		expect(Object.keys(user)).not.toContain('search_tsv');
		expect(Object.keys(user)).not.toContain('owner_id');
		const bot = toJournalItem(
			{ id: 'j2', kind: 'nope', state: 'x', source_bot_id: 'b1' },
			{ botNames: new Map([['b1', '봇이름']]) }
		);
		expect(bot.bot).toEqual({ id: 'b1', name: '봇이름' });
		expect(bot.kind).toBe('thought');
		expect(bot.state).toBe('pending');
	});

	it('타임라인 날짜 묶음(순서 유지)', () => {
		const g = groupByDate(
			['2026-11-02', '2026-11-02', '2026-11-01'].map((d, i) =>
				toJournalItem({ id: String(i), entry_date: d, kind: 'review', state: 'done', title: 't' })
			)
		);
		expect(g.map((x) => [x.date, x.items.length])).toEqual([
			['2026-11-02', 2],
			['2026-11-01', 1]
		]);
		expect(dotDate('2026-11-02')).toBe('2026.11.02');
	});

	it('칩 건수', () => {
		expect(countKinds(['buy', 'buy', 'review', 'zzz'])).toEqual({
			all: 4,
			buy: 2,
			sell: 0,
			thought: 0,
			plan: 0,
			review: 1
		});
	});

	it('이전/다음', () => {
		const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
		expect(neighbors(items, 'a')).toEqual({ index: 0, prev: null, next: 'b' });
		expect(neighbors(items, 'c')).toEqual({ index: 2, prev: 'b', next: null });
		expect(neighbors(items, 'z')).toEqual({ index: -1, prev: null, next: null });
	});

	it('상세 경로는 목록 쿼리를 싣는다', () => {
		expect(detailPath('/journal', 'abc', '?type=buy')).toBe('/journal/abc?type=buy');
	});

	it('종목 코드 묶음·수량 표시·KST 오늘', () => {
		expect(itemTickers({ instrument_ticker: 'A', tickers: ['B', 'A'] })).toEqual(['A', 'B']);
		expect(qtyText(5, 'stock')).toBe('5주');
		expect(qtyText(1.25, 'cash')).toBe('1.25');
		expect(kstToday(new Date('2026-11-21T16:30:00Z'))).toBe('2026-11-22');
	});
});
