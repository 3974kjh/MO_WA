/**
 * 값-키 each(태그·종목 코드)에 같은 값이 두 번 들어와도 화면이 멈추지 않고 한 번씩만 보인다(each_key_duplicate 방지).
 * 홈 태그는 routes/(app)/page.svelte.spec.ts.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import BriefingList from '../../routes/(app)/briefings/+page.svelte';
import BriefingDetail from '../../routes/(app)/briefings/[date]/+page.svelte';
import JournalForm from '$lib/components/journal/JournalForm.svelte';

const count = (root: Element, sel: string, word: string) =>
	[...root.querySelectorAll(sel)].map((el) => (el.textContent ?? '').split(word).length - 1);

const brief = {
	id: 'r1',
	kind: 'daily_brief',
	slug: 'daily',
	title: '데일리 경제이슈 브리핑',
	headline: '금리 동결',
	summary: '한 줄 요약',
	report_date: '2026-11-20',
	tags: ['금리', '환율', '금리'],
	kospi_change_pct: null
};

describe('중복 값 렌더 (값-키 each)', () => {
	it('브리핑 목록: 같은 태그 두 번이어도 행마다 한 번', () => {
		const { container } = render(BriefingList, {
			data: {
				title: '브리핑',
				query: { q: '', tag: '', month: '', page: 1 },
				error: null,
				briefings: { items: [brief], total: 1, page: 1, totalPages: 1 }
			} as never
		});
		const n = count(container, '.item .tags, .tags', '금리');
		expect(n.length).toBeGreaterThan(0);
		for (const k of n) expect(k).toBe(1);
	});
	it('브리핑 상세: 머리 태그 한 번씩', () => {
		const { container } = render(BriefingDetail, {
			data: {
				title: '브리핑',
				briefing: { ...brief, sources: [], generated_at: null, version: 1 },
				body: null,
				mode: 'summary'
			} as never
		});
		expect(count(container, '.head .tags', '금리')).toEqual([1]);
		expect(container.querySelector('.head .tags')?.textContent).toContain('환율');
	});
	it('매매일지 폼: 저장된 연결 종목에 같은 코드가 두 번이어도 칩은 한 번(표시만)', () => {
		const item = {
			id: 'j1',
			entry_date: '2026-11-20',
			kind: 'memo',
			state: 'done',
			title: '메모',
			tickers: ['005930', '035420', '005930'],
			instrument_id: null,
			instrument_ticker: null,
			instrument_name: null,
			instrument_asset_type: null,
			price: null,
			qty: null,
			breakeven: null,
			currency: null,
			memo_md: null,
			source_url: null,
			report_id: null,
			bot: null
		};
		const { container } = render(JournalForm, {
			item: item as never,
			instruments: [],
			reports: [],
			today: '2026-11-28',
			onsaved: () => {},
			oncancel: () => {}
		});
		const chips = [...container.querySelectorAll('ul.chips .mw-chip')].map((c) => c.textContent);
		expect(chips).toEqual(['005930', '035420']);
	});
});
