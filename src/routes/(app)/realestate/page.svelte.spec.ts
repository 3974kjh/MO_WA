/**
 * FE-12 /realestate(client): 5탭 · 키 없음 폴백(네트워크 요청 없음) · 목록 대안 · 모바일 목록|지도 전환·시트 · 빈/오류 상태.
 * 키가 있는 경로(지도 상태기계)는 ComplexMap.svelte.spec.ts에서 가짜 SDK로 본다.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { flushSync } from 'svelte';
import { buildComplexMapModel, type ComplexRow } from '$lib/maps/points';
import Page from './+page.svelte';

const row = (o: Partial<ComplexRow>): ComplexRow => ({
	id: '00000000-0000-4000-8000-000000000001',
	name: '샘플',
	sido: '경기도',
	sigungu: '파주시',
	address: '경기도 파주시 샘플로 1',
	lat: 37.7,
	lng: 126.73,
	households: 3042,
	built_year: 2020,
	main_type: '59㎡대',
	total_score: 78.6,
	rating: 4,
	is_target: true,
	roles: ['target'],
	...o
});
const ROWS = [
	row({ id: '00000000-0000-4000-8000-000000000001', name: '가단지' }),
	row({
		id: '00000000-0000-4000-8000-000000000002',
		name: '나단지',
		total_score: 60,
		rating: 3
	}),
	row({
		id: '00000000-0000-4000-8000-000000000003',
		name: '<b>다</b>단지',
		lat: null,
		lng: null,
		total_score: null,
		rating: null,
		is_target: false,
		roles: ['candidate']
	})
];
const data = (o: Record<string, unknown> = {}) =>
	({
		title: '부동산',
		query: { tab: 'map', c: null },
		loadedAt: '2026-11-28T12:00:00Z',
		error: null,
		priceError: null,
		mapKeyId: null,
		...buildComplexMapModel(ROWS, [
			{ complex_id: '00000000-0000-4000-8000-000000000001', as_of: '2026-11-04', med_price: 59600 }
		]),
		...o
	}) as never;
const text = () => document.body.textContent?.replace(/\s+/g, ' ') ?? '';

describe('FE-12 /realestate 탭', () => {
	it('탭 줄은 시안 5탭이 모두 링크(준비 중·비활성 없음), 현재 탭만 aria-current', () => {
		const r = render(Page, { data: data({ query: { tab: 'watch', c: null } }) });
		const nav = document.querySelector('nav[aria-label="부동산 하위 탭"]')!;
		const links = [...nav.querySelectorAll('a')];
		expect(links.map((a) => a.textContent)).toEqual([
			'오늘 브리핑',
			'시세 동향',
			'청약',
			'관심 단지',
			'지도'
		]);
		expect(links.map((a) => a.getAttribute('aria-current'))).toEqual([
			null,
			null,
			null,
			'page',
			null
		]);
		expect(links.map((a) => new URL(a.href).searchParams.get('tab'))).toEqual([
			'brief',
			'trend',
			'subs',
			'watch',
			'map'
		]);
		expect(nav.querySelector('[aria-disabled]')).toBeNull();
		expect(text()).not.toContain('준비 중');
		r.unmount();
	});

	it('브리핑·시세·청약 탭은 빈 상태 골격이고 지도 코드·요청은 없다', async () => {
		for (const tab of ['brief', 'trend', 'subs']) {
			const r = render(Page, {
				data: data({ query: { tab, c: null }, items: [], located: 0, missing: 0 })
			});
			await new Promise((res) => setTimeout(res, 20));
			expect(document.querySelector('[data-testid="complex-map"]')).toBeNull();
			expect(document.querySelector('.rm')).toBeNull();
			expect(document.querySelector('script[src*="oapi.map.naver.com"]')).toBeNull();
			expect(text()).toMatch(/아직 없어요/);
			r.unmount();
		}
	});

	it('관심 단지 탭: 단지 카드(태블릿 2열)·지도 보기 링크, 위치 없는 단지는 지도 링크 없음', async () => {
		await page.viewport(768, 900);
		const r = render(Page, { data: data({ query: { tab: 'watch', c: null } }) });
		const grid = document.querySelector('[data-testid="watch-cards"]') as HTMLElement;
		expect(getComputedStyle(grid).gridTemplateColumns.split(' ')).toHaveLength(2);
		expect(grid.querySelectorAll('article').length).toBeGreaterThan(0);
		expect(grid.querySelector('a[href*="tab=map&c="]')).not.toBeNull();
		r.unmount();
		await page.viewport(414, 896);
		const r2 = render(Page, { data: data({ query: { tab: 'watch', c: null } }) });
		const g2 = document.querySelector('[data-testid="watch-cards"]') as HTMLElement;
		expect(getComputedStyle(g2).gridTemplateColumns.split(' ')).toHaveLength(1);
		r2.unmount();
	});
});

describe('FE-12 /realestate 지도 탭', () => {
	it('키가 없으면 안내(nokey, 다시 시도 없음) + 목록 + 행마다 네이버 링크 · SDK 요청 없음 · 화면에 키 이름 없음', async () => {
		await page.viewport(1280, 800);
		const r = render(Page, { data: data() });
		await new Promise((res) => setTimeout(res, 50));
		const box = document.querySelector('[data-testid="complex-map"]') as HTMLElement;
		expect(box.dataset.state).toBe('nokey');
		const fb = box.querySelector('[data-testid="map-fallback"]')!;
		expect(fb.getAttribute('data-reason')).toBe('nokey');
		expect(fb.querySelector('button')).toBeNull();
		expect(document.querySelector('.rm')?.getAttribute('data-fallback')).toBe('1');
		expect(document.querySelector('script[src*="oapi.map.naver.com"]')).toBeNull();
		expect(document.querySelector('link[href*="pstatic.net"]')).toBeNull();
		expect(
			performance.getEntriesByType('resource').some((e) => e.name.includes('map.naver.com'))
		).toBe(false);
		expect(text()).toContain('지도가 아직 연결되지 않았어요');
		expect(document.querySelector('a[href="#re-list"]')?.textContent).toBe(
			'지도 건너뛰고 단지 목록으로'
		);
		const rowLinks = document.querySelectorAll(
			'[data-testid="complex-list"] a[href^="https://map.naver.com/p/search/"]'
		);
		expect(rowLinks).toHaveLength(2);
		expect(text()).not.toMatch(/PUBLIC_|ncpKeyId|Client ID|navermap/);
		r.unmount();
	});

	it('목록: 위치 있는 단지만 등급·점수 순, 위치 없는 단지는 접힌 목록(이름+네이버 링크), 처음엔 아무것도 안 고름', () => {
		const r = render(Page, { data: data() });
		expect(
			document.querySelector('[data-testid="re-asof"]')?.textContent?.replace(/\s+/g, ' ')
		).toMatch(/지도 2곳 ?· 위치 정보 없음 1곳/);
		expect(text()).toContain('2026-11-04 기준');
		const btns = [
			...document.querySelectorAll('[data-testid="complex-list"] button')
		] as HTMLButtonElement[];
		expect(btns.map((b) => b.getAttribute('aria-label')?.split(',')[0])).toEqual([
			'가단지',
			'나단지'
		]);
		expect(btns.every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
		const nogeo = document.querySelector('[data-testid="complex-nogeo"]') as HTMLDetailsElement;
		expect(nogeo.open).toBe(false);
		expect(nogeo.querySelector('summary')?.textContent).toContain('위치 정보가 없는 단지 1곳');
		expect(nogeo.textContent).toContain('지도에는 찍지 않았어요. 이름으로 찾아볼 수 있어요.');
		// DB 문자열은 텍스트로만(태그로 해석하지 않음)
		expect(document.querySelector('[data-testid="complex-nogeo"] b')).toBeNull();
		expect(nogeo.textContent).toContain('<b>다</b>단지');
		const a = nogeo.querySelector('a') as HTMLAnchorElement;
		expect(a.href.startsWith('https://map.naver.com/p/search/')).toBe(true);
		expect(a.target).toBe('_blank');
		expect(a.rel).toContain('noopener');
		expect(a.rel).toContain('noreferrer');
		r.unmount();
	});

	it('등급 범례: 끄면 목록이 줄고(aria-pressed·안내), 전부 끄면 [모든 등급 켜기]', () => {
		const r = render(Page, { data: data() });
		const chips = [...document.querySelectorAll('.rm-lc')] as HTMLButtonElement[];
		expect(chips.map((c) => c.getAttribute('aria-label'))).toEqual([
			'최우선 1곳 표시',
			'관심 1곳 표시'
		]);
		chips[0].click();
		flushSync();
		expect(chips[0].getAttribute('aria-pressed')).toBe('false');
		expect(document.querySelectorAll('[data-testid="complex-list"] button')).toHaveLength(1);
		expect(document.querySelector('.rm-live')?.textContent).toContain(
			'최우선 단지 숨김. 지금 1곳이 보여요.'
		);
		chips[1].click();
		flushSync();
		expect(document.querySelectorAll('[data-testid="complex-list"] button')).toHaveLength(0);
		expect(text()).toContain('보이는 단지가 없어요');
		const all = [...document.querySelectorAll('button')].find((b) =>
			b.textContent?.includes('모든 등급 켜기')
		)!;
		all.click();
		flushSync();
		expect(document.querySelectorAll('[data-testid="complex-list"] button')).toHaveLength(2);
		r.unmount();
	});

	it('주소의 c로 처음 고를 단지를 정한다', () => {
		const r = render(Page, {
			data: data({ query: { tab: 'map', c: '00000000-0000-4000-8000-000000000002' } })
		});
		const pressed = document.querySelector('[data-testid="complex-list"] [aria-pressed="true"]');
		expect(pressed?.getAttribute('aria-label')).toContain('나단지');
		r.unmount();
	});

	it('빈 상태 · 오류 상태 · 가격만 실패하면 배너', () => {
		let r = render(Page, {
			data: data({ items: [], located: 0, missing: 0, priceAsOf: null })
		});
		expect(text()).toContain('지도에 표시할 단지가 없어요');
		r.unmount();
		r = render(Page, {
			data: data({ error: '목록을 불러오지 못했어요.', items: [], located: 0, missing: 0 })
		});
		expect(text()).toContain('부동산 자료를 불러오지 못했어요');
		r.unmount();
		r = render(Page, { data: data({ priceError: '정보를 불러오지 못했어요.' }) });
		expect(text()).toContain('가격 자료를 불러오지 못해 가격 없이 보여요');
		r.unmount();
	});

	it('위치 있는 단지가 하나도 없으면 안내 카드 + 위치 없는 단지 목록이 펼쳐진 채', () => {
		const nogeoRows = ROWS.slice(2);
		const r = render(Page, {
			data: data({ ...buildComplexMapModel(nogeoRows, []), mapKeyId: 'placeholderKey01' })
		});
		expect(text()).toContain('지도에 표시할 단지가 없어요');
		expect(text()).toContain('위치가 없는 단지는 아래 목록에서 이름으로 볼 수 있어요.');
		expect(
			(document.querySelector('[data-testid="complex-nogeo"]') as HTMLDetailsElement).open
		).toBe(true);
		expect(document.querySelector('.rm a[href*="tab=watch"]')?.textContent).toBe('관심 단지 보기');
		r.unmount();
	});
});

describe('FE-12 /realestate 모바일 목록|지도 전환·시트', () => {
	it('전환 버튼(aria-pressed)이 면을 바꾸고, 지도 모드에서만 페이지 스크롤을 잠근다', async () => {
		await page.viewport(414, 896);
		// 키가 있어도 SDK는 이 시험의 대상이 아니다: 청크·SDK가 오기 전(로딩 면)까지의 전환만 본다
		const r = render(Page, { data: data({ mapKeyId: 'placeholderKey01' }) });
		const rm = document.querySelector('.rm') as HTMLElement;
		const seg = [...document.querySelectorAll('.rm-seg button')] as HTMLButtonElement[];
		expect(seg.map((b) => b.textContent?.trim())).toEqual(['목록', '지도']);
		expect(rm.dataset.view).toBe('map');
		expect(seg.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
		expect(document.documentElement.classList.contains('rm-lock')).toBe(true);
		for (const b of seg) expect(b.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
		seg[0].click();
		flushSync();
		expect(rm.dataset.view).toBe('list');
		expect(seg.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
		expect(document.documentElement.classList.contains('rm-lock')).toBe(false);
		expect(getComputedStyle(document.querySelector('.rm-mapcol')!).display).toBe('none');
		seg[1].click();
		flushSync();
		expect(document.documentElement.classList.contains('rm-lock')).toBe(true);
		expect(getComputedStyle(document.querySelector('.rm-mapcol')!).position).toBe('fixed');
		r.unmount();
		expect(document.documentElement.classList.contains('rm-lock')).toBe(false);
	});

	it('범례 버튼은 aria-expanded로 패널을 열고 접는다', async () => {
		await page.viewport(414, 896);
		const r = render(Page, { data: data() });
		const btn = document.querySelector('.rm-legbtn') as HTMLButtonElement;
		expect(btn.getAttribute('aria-expanded')).toBe('false');
		expect(btn.textContent).toContain('2/2');
		btn.click();
		flushSync();
		expect(btn.getAttribute('aria-expanded')).toBe('true');
		expect(document.querySelector('.rm')?.getAttribute('data-legend')).toBe('open');
		r.unmount();
	});

	it('목록 행을 누르면 바텀시트(모달·본문·꼬리 [점수 근거 보기]), 닫으면 시트가 사라진다', async () => {
		await page.viewport(414, 896);
		const r = render(Page, { data: data() });
		const row = document.querySelector('[data-testid="complex-list"] button') as HTMLButtonElement;
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		row.click();
		flushSync();
		await new Promise((res) => setTimeout(res, 50));
		const dlg = document.querySelector('[role="dialog"]') as HTMLElement;
		expect(dlg).not.toBeNull();
		expect(dlg.getAttribute('aria-modal')).toBe('true');
		expect(dlg.textContent).toContain('가단지');
		expect(dlg.textContent).toContain('실거래 중앙값');
		expect(dlg.querySelector('a[href*="tab=watch"]')?.textContent).toBe('점수 근거 보기');
		expect(row.getAttribute('aria-pressed')).toBe('true');
		expect(document.querySelector('.rm-live')?.textContent).toContain('정보 시트가 열렸어요');
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		flushSync();
		await new Promise((res) => setTimeout(res, 50));
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		r.unmount();
	});
});
