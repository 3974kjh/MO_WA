/**
 * FE-12 /realestate(client): 키 없음 폴백(네트워크 요청 없음) · 목록 대안 · 선택 공유 · 빈/오류 상태.
 * 키가 있는 경로(지도 상태기계)는 ComplexMap.svelte.spec.ts에서 가짜 SDK로 본다.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
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

describe('FE-12 /realestate 지도 탭', () => {
	it('키가 없으면 지도 대신 안내(nokey) · SDK 태그·요청 없음 · 화면에 키 이름 없음', async () => {
		const r = render(Page, { data: data() });
		await new Promise((res) => setTimeout(res, 50));
		const box = document.querySelector('[data-testid="complex-map"]') as HTMLElement;
		expect(box.dataset.state).toBe('nokey');
		expect(box.querySelector('[data-testid="map-fallback"]')?.getAttribute('data-reason')).toBe(
			'nokey'
		);
		expect(document.querySelector('script[src*="oapi.map.naver.com"]')).toBeNull();
		expect(document.querySelector('link[href*="pstatic.net"]')).toBeNull();
		expect(
			performance.getEntriesByType('resource').some((e) => e.name.includes('map.naver.com'))
		).toBe(false);
		expect(text()).toContain('지도는 아직 준비 중이에요');
		expect(text()).not.toMatch(/PUBLIC_|ncpKeyId|Client ID/);
		r.unmount();
	});

	it('탭 줄: 지도만 링크(aria-current), 나머지는 준비 중 + 이유 문장', () => {
		const r = render(Page, { data: data() });
		const nav = document.querySelector('nav[aria-label="부동산 하위 탭"]')!;
		const links = [...nav.querySelectorAll('a')];
		expect(links.map((a) => [a.textContent, a.getAttribute('aria-current')])).toEqual([
			['지도', 'page']
		]);
		const off = [...nav.querySelectorAll('[aria-disabled="true"]')];
		expect(off).toHaveLength(4);
		expect(off[0].getAttribute('aria-describedby')).toBe('re-tabs-why');
		expect(document.getElementById('re-tabs-why')?.textContent).toContain('준비 중');
		r.unmount();
	});

	it('목록 대안: 모든 단지(위치 없음 포함) · 1위가 처음 선택 · 고르면 정보 카드가 바뀐다', () => {
		const r = render(Page, { data: data() });
		expect(
			document.querySelector('[data-testid="re-asof"]')?.textContent?.replace(/\s+/g, ' ')
		).toMatch(/지도 2곳 ?· 위치 정보 없음 1곳/);
		expect(text()).toContain('2026-11-04 기준');
		const btns = [
			...document.querySelectorAll('[data-testid="complex-list"] button')
		] as HTMLButtonElement[];
		expect(btns).toHaveLength(3);
		expect(btns[0].getAttribute('aria-pressed')).toBe('true');
		expect(btns[2].getAttribute('aria-label')).toContain('위치 정보 없음');
		// DB 문자열은 텍스트로만(태그로 해석하지 않음)
		expect(document.querySelector('[data-testid="complex-list"] b')).toBeNull();
		expect(text()).toContain('<b>다</b>단지');
		const detail = () => document.querySelector('[data-testid="complex-detail"]') as HTMLElement;
		expect(detail().getAttribute('aria-live')).toBe('polite');
		expect(detail().textContent).toContain('1. 가단지');
		btns[2].click();
		flushSync();
		expect(btns[2].getAttribute('aria-pressed')).toBe('true');
		expect(btns[0].getAttribute('aria-pressed')).toBe('false');
		expect(detail().textContent).toContain('지도에는 표시하지 않았어요');
		const a = detail().querySelector('a') as HTMLAnchorElement;
		expect(a.href.startsWith('https://map.naver.com/p/search/')).toBe(true);
		expect(a.target).toBe('_blank');
		expect(a.rel).toContain('noopener');
		expect(a.rel).toContain('noreferrer');
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
});
