/**
 * FE-11 /stocks/[ticker] 상세(client): 결정 3 안내 · 결정 4 오래됨/기준 시각 없음 · 결정 1 리포트 링크(?from).
 */
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { kstToday } from '$lib/stocks/view';
import Page from './+page.svelte';

const INST = {
	id: 'i1',
	ticker: '108490',
	name: '로보티즈',
	market: 'KRX',
	asset_type: 'stock',
	is_watchlist: false
};
const point = (as_of: string, close = 200000) => ({
	instrument_id: 'i1',
	as_of,
	close,
	change_pct: 1,
	currency: 'KRW',
	foreign_net_buy: null,
	inst_net_buy: null
});
const full = (o: Record<string, unknown> = {}) =>
	({
		title: '로보티즈',
		portfolioOnly: false,
		instrument: INST,
		positions: [
			{
				id: 'p1',
				instrument_id: 'i1',
				status: 'planned',
				currency: 'KRW',
				qty: null,
				avg_price: null,
				breakeven: null,
				trigger_price: 210000,
				trigger_direction: 'below',
				watch_only: false,
				memo: null,
				base_at: null
			}
		],
		positionsError: null,
		series: [point(kstToday())],
		seriesError: null,
		reports: [
			{
				id: 'r1',
				slug: 'plan-108490',
				title: '로보티즈 매수 계획서',
				subtype: 'buy_plan',
				status: 'draft',
				report_date: '2026-11-20',
				tickers: ['108490']
			}
		],
		memo: null,
		reportsError: null,
		targets: [],
		targetsError: null,
		mentions: [],
		journal: { items: [], total: 0 },
		relatedError: null,
		holdingValue: null,
		totalKrw: null,
		valuationError: null,
		...o
	}) as never;
const q = (sel: string) => document.querySelector(sel);
const text = () => document.body.textContent ?? '';

describe('FE-11 종목 상세 화면', () => {
	it("결정 3: bond·cash는 '포트폴리오에서 봐 주세요' + 포트폴리오 링크만", () => {
		const r = render(Page, {
			data: {
				title: 'UST_30Y',
				portfolioOnly: true,
				instrument: { ...INST, ticker: 'UST_30Y', name: '미국채 30년', asset_type: 'bond' }
			} as never
		});
		// 이름 뒤 조사 표기 없이(DS §7-15 v1.7.5 '조사')
		expect(text()).toContain('포트폴리오에서 봐 주세요');
		expect(text()).toContain('채권·현금은 종목 화면에서 다루지 않아요');
		expect(text()).not.toContain('은(는)');
		expect(q('a[href="/portfolio"]')).not.toBeNull();
		expect(q('[data-testid="stock-basis"]')).toBeNull();
		r.unmount();
	});
	it('결정 4: 최신 시세면 배너 없음, 3일 넘으면 오래됨 배너', () => {
		const fresh = render(Page, { data: full() });
		expect(q('[data-testid="stock-stale"]')).toBeNull();
		expect(q('[data-testid="stock-basis"]')?.textContent).toContain('KRX 종가');
		fresh.unmount();
		const old = render(Page, { data: full({ series: [point('2026-11-20')] }) });
		expect(q('[data-testid="stock-stale"]')?.textContent).toContain('11/20(금) KRX 종가');
		old.unmount();
	});
	it("결정 4: 시세도 base_at도 없으면 '기준 시각 없음'", () => {
		const r = render(Page, { data: full({ series: [] }) });
		expect(q('[data-testid="stock-basis"]')?.textContent).toContain('기준 시각 없음');
		expect(q('[data-testid="hold-basis"]')?.textContent).toContain('기준 시각 없음');
		expect(q('[data-testid="stock-stale"]')).toBeNull();
		r.unmount();
	});
	it('결정 1: 이 화면에서 여는 리포트 링크는 ?from=이 종목', () => {
		const r = render(Page, { data: full() });
		const links = [...document.querySelectorAll('a[href^="/analyses/"]')].map((a) =>
			a.getAttribute('href')
		);
		expect(links.length).toBeGreaterThan(0);
		expect(links.every((h) => h === '/analyses/plan-108490?from=108490')).toBe(true);
		r.unmount();
	});
	it("'내 보유' 기준 시각은 시세 시각, 보유 기록 시각은 따로", () => {
		const r = render(Page, {
			data: full({
				series: [point('2026-10-28')],
				positions: [
					{
						...(full() as { positions: object[] }).positions[0],
						base_at: '2026-11-28T06:40:00Z'
					}
				]
			})
		});
		const t = q('[data-testid="hold-basis"]')?.textContent ?? '';
		expect(t).toContain('기준 시각 10/28(수) KRX 종가');
		expect(t).toContain('보유 기록 11/28 15:40');
		r.unmount();
	});
	it('시세 0건이면 "아직 없어요"(현재가는 위에… 문구 없음) + 헤더 — 에 SR 현재가 없음', () => {
		const r = render(Page, { data: full({ series: [] }) });
		expect(text()).toContain('시세 기록이 아직 없어요');
		expect(text()).not.toContain('현재가는 위에 표시돼요');
		expect(text()).toContain('현재가 없음');
		r.unmount();
		const short = render(Page, { data: full() });
		expect(text()).toContain('시세 기록이 아직 짧아요');
		short.unmount();
	});
	it('헤더 등락 앞에 전일 대비', () => {
		const r = render(Page, { data: full() });
		expect(q('.px')?.textContent).toContain('전일 대비');
		r.unmount();
	});
	it('리포트가 없으면 최신 리포트 버튼은 비활성 + 이유', () => {
		const r = render(Page, { data: full({ reports: [] }) });
		const off = q('[aria-disabled="true"]');
		expect(off?.textContent).toContain('최신 리포트');
		r.unmount();
	});
});
