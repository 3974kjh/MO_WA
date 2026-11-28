/**
 * FE-11 /stocks 보드(client): 빈 상태 · 오래됨 배너 · 기준 시각 · 종목명 링크(결정 3).
 */
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { kstToday } from '$lib/stocks/view';
import Page from './+page.svelte';

const row = (o: Record<string, unknown> = {}) => ({
	ticker: '035420',
	name: 'NAVER',
	market: 'KRX',
	kind: 'hold',
	currency: 'KRW',
	price: 200,
	change_pct: -1.2,
	as_of: kstToday(),
	qty: 10,
	avg_price: 100,
	value_krw: 2000,
	trigger_price: null,
	trigger_direction: 'below',
	watch_only: false,
	planned: false,
	memo: null,
	report: null,
	...o
});
const data = (o: Record<string, unknown> = {}) =>
	({
		title: '종목',
		query: { q: '', f: 'all', sort: 'default' },
		loadedAt: '2026-11-28T00:00:00Z',
		error: null,
		reportsError: null,
		rows: [],
		drafts: [],
		...o
	}) as never;
const q = (sel: string) => document.querySelector(sel);

describe('FE-11 /stocks 화면', () => {
	it('빈 상태: 포트폴리오·매매일지로 가는 길', () => {
		const r = render(Page, { data: data() });
		expect(document.body.textContent).toContain('아직 모아 볼 종목이 없어요');
		const hrefs = [...document.querySelectorAll('a')].map((a) => a.getAttribute('href'));
		expect(hrefs).toEqual(expect.arrayContaining(['/portfolio', '/journal']));
		r.unmount();
	});
	it('불러오기 실패: 오류 상태 + 마지막으로 불러온 시각', () => {
		const r = render(Page, { data: data({ error: '목록을 불러오지 못했어요.' }) });
		expect(document.body.textContent).toContain('종목 목록을 불러오지 못했어요');
		expect(document.body.textContent).toContain('마지막으로 불러온 시각');
		r.unmount();
	});
	it('L2: 리포트를 못 읽으면 매수 계획서 칸은 0건 대신 —·불러오지 못함', () => {
		const r = render(Page, {
			data: data({ rows: [row()], reportsError: '정보를 불러오지 못했어요.' })
		});
		const t = document.body.textContent ?? '';
		expect(t).toContain('리포트를 불러오지 못했어요');
		expect(t).not.toContain('0건');
		r.unmount();
	});
	it('결정 4: 마지막 시세가 3일 넘게 지나면 오래됨 배너, 최신이면 없음', () => {
		const fresh = render(Page, { data: data({ rows: [row()] }) });
		expect(q('[data-testid="stocks-stale"]')).toBeNull();
		expect(q('[data-testid="stocks-asof"]')?.textContent).toContain('KRX 종가');
		fresh.unmount();
		const old = render(Page, { data: data({ rows: [row({ as_of: '2026-11-01' })] }) });
		expect(q('[data-testid="stocks-stale"]')?.textContent).toContain('11/1(일) KRX 종가');
		old.unmount();
	});
	it("결정 4: 시세 날짜가 하나도 없으면 '기준 시각 없음'(오래됨 배너 없음)", () => {
		const r = render(Page, {
			data: data({ rows: [row({ as_of: null, price: null, change_pct: null })] })
		});
		expect(q('[data-testid="stocks-asof"]')?.textContent).toBe('기준 시각 없음');
		expect(q('[data-testid="stocks-stale"]')).toBeNull();
		r.unmount();
	});
	it('종목명 글자만 종목 화면 링크', () => {
		const r = render(Page, { data: data({ rows: [row()] }) });
		const links = [...document.querySelectorAll('a[href="/stocks/035420"]')];
		expect(links.length).toBeGreaterThan(0);
		expect(links.every((a) => a.textContent?.includes('NAVER'))).toBe(true);
		r.unmount();
	});
	it("'관심만'은 watch_only에만, 감시 가격 없는 관심 종목은 —", () => {
		const r = render(Page, {
			data: data({
				rows: [
					row({ ticker: '005380', name: '현대차', kind: 'watch', watch_only: true, planned: true }),
					row({ ticker: '000660', name: 'SK하이닉스', kind: 'watch' })
				]
			})
		});
		const cells = [...document.querySelectorAll('td[data-label="감시 가격"]')].map(
			(td) => td.textContent?.trim() ?? ''
		);
		expect(cells[0]).toContain('관심만');
		expect(cells[1]).toBe('—');
		expect(cells[1]).not.toContain('관심만');
		r.unmount();
	});
	it('표 머리글은 현재가 · 전일 대비', () => {
		const r = render(Page, { data: data({ rows: [row()] }) });
		expect(document.querySelector('thead')?.textContent).toContain('현재가 · 전일 대비');
		r.unmount();
	});
});
