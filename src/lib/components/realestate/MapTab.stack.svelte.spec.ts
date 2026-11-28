/**
 * 겹친 단지 목록(최대 확대에서도 남는 묶음): PC 앵커 카드와 모바일 시트, Esc로 정보 → 목록 → 묶음 순 복귀.
 * 가짜 SDK(window.naver)를 두어 실제 네이버 요청 없이 MapTab 전체(ComplexMap 포함)를 돌린다.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { flushSync } from 'svelte';
import type { ComplexItem } from '$lib/maps/points';
import MapTab from './MapTab.svelte';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const mk = (id: string, name: string, o: Partial<ComplexItem> = {}): ComplexItem => ({
	id,
	rank: 1,
	name,
	region: '경기도 성남시',
	address: null,
	lat: 37.36,
	lng: 127.11,
	households: 1200,
	builtYear: 2005,
	mainType: null,
	score: 71,
	rating: 3.5,
	tier: 'target',
	medPrice: null,
	priceAsOf: null,
	naverUrl: 'https://map.naver.com/p/search/x',
	...o
});
// 같은 자리(수 미터 안)에 겹친 셋 + 떨어진 하나
const STACKED = [
	mk('s1', '정자역 1단지', { score: 80, rating: 4, tier: 'top' }),
	mk('s2', '정자역 2단지'),
	mk('s3', '정자역 상가주택', { score: null, rating: null, tier: 'ref' }),
	mk('far', '먼 단지', { lat: 37.5, lng: 127.3 })
];

type Ls = { t: unknown; n: string; f: () => void };
function installFakeSdk() {
	const ls: Ls[] = [];
	const fire = (t: unknown, n: string) =>
		ls.filter((l) => l.t === t && l.n === n).forEach((l) => l.f());
	class LatLng {
		constructor(
			public lat: number,
			public lng: number
		) {}
	}
	class Point {
		constructor(
			public x: number,
			public y: number
		) {}
	}
	class LatLngBounds {
		constructor(
			public sw: LatLng,
			public ne: LatLng
		) {}
	}
	class FMap {
		zoom = 9;
		constructor(
			public el: HTMLElement,
			o: { zoom: number }
		) {
			this.zoom = o.zoom;
			setTimeout(() => fire(this, 'tilesloaded'), 10);
		}
		getZoom() {
			return this.zoom;
		}
		setZoom(z: number) {
			this.zoom = z;
			fire(this, 'zoom_changed');
		}
		setCenter() {}
		// 모든 단지를 한 화면에 넣으려 하면 먼 단지 때문에 낮은 줌, 겹친 묶음만이면 최대 확대
		fitBounds(b: LatLngBounds) {
			this.setZoom(Math.abs(b.ne.lat - b.sw.lat) < 0.001 ? 17 : 11);
		}
		getBounds() {
			return { hasLatLng: () => true };
		}
		getProjection() {
			const k = 2 ** this.zoom;
			return { fromCoordToOffset: (c: LatLng) => ({ x: c.lng * k, y: -c.lat * k }) };
		}
		panBy() {}
		panTo() {}
		destroy() {}
	}
	class FMarker {
		el: HTMLElement;
		constructor(o: { map: FMap; position: LatLng; icon: { content: HTMLElement } }) {
			this.el = o.icon.content;
			this.el.style.position = 'absolute';
			this.el.style.left = `${(o.position.lng - 127) * 2000}px`;
			this.el.style.top = `${(37.6 - o.position.lat) * 2000}px`;
			o.map.el.append(this.el);
		}
		setMap(m: unknown) {
			if (!m) this.el.remove();
		}
	}
	const Event = {
		once: (t: unknown, n: string, f: () => void) => (ls.push({ t, n, f }), ls[ls.length - 1]),
		addListener: (t: unknown, n: string, f: () => void) => (
			ls.push({ t, n, f }),
			ls[ls.length - 1]
		),
		removeListener: (a: Ls[]) => a.forEach((l) => ls.splice(ls.indexOf(l), 1)),
		trigger: () => {}
	};
	(window as unknown as { naver: unknown }).naver = {
		maps: { LatLng, Point, LatLngBounds, Marker: FMarker, Map: FMap, Event, Position: {} }
	};
}

afterEach(() => {
	delete (window as unknown as { naver?: unknown }).naver;
});

const key = (el: Element | null, k: string) =>
	(el ?? document.body).dispatchEvent(
		new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })
	);
const cluster = () => document.querySelector('.rm-cl') as HTMLButtonElement;
const live = () => document.querySelector('.rm-live')?.textContent ?? '';

async function open(items: ComplexItem[]) {
	installFakeSdk();
	const r = render(MapTab, {
		items,
		mapKeyId: 'placeholderKey01',
		asOfText: '',
		watchHref: (id: string) => `/realestate?tab=watch&c=${id}`
	});
	await sleep(400); // 지도 청크 + 가짜 SDK 첫 타일(전체 스위트에서 250ms는 빠듯함)
	flushSync();
	return r;
}

describe('겹친 단지 목록 — PC 앵커 카드', () => {
	it('최대 확대 묶음은 목록을 열고, 행 → 정보 → Esc 목록 → Esc 묶음으로 한 단계씩 돌아간다', async () => {
		await page.viewport(1280, 800);
		const r = await open(STACKED.slice(0, 3));
		const cl = cluster();
		expect(cl.dataset.stack).toBe('1');
		expect(cl.getAttribute('aria-label')).toBe(
			'단지 3곳 묶음, 최우선 1곳 포함. 누르면 겹친 단지 목록을 열어요'
		);
		expect(cl.getAttribute('aria-expanded')).toBe('false');

		cl.click();
		await sleep(60);
		flushSync();
		const card = document.querySelector('[data-testid="stack-card"]') as HTMLElement;
		expect(card.getAttribute('role')).toBe('dialog');
		expect(card.querySelector('h3')?.textContent).toBe('겹친 단지 3곳');
		expect(card.querySelectorAll('button.rm-row')).toHaveLength(3);
		expect(card.querySelector('button.rm-row')?.getAttribute('aria-label')).toContain(
			'정보를 열려면 누르세요'
		);
		expect(cluster().getAttribute('aria-expanded')).toBe('true');
		expect(live()).toContain('겹친 단지 3곳 목록이 열렸어요');
		expect(document.querySelector('[data-testid="complex-card"]')).toBeNull();

		(card.querySelectorAll('button.rm-row')[1] as HTMLElement).click(); // 정자역 2단지
		await sleep(60);
		flushSync();
		const info = document.querySelector('[data-testid="complex-card"]') as HTMLElement;
		expect(info.querySelector('h3')?.textContent).toBe('정자역 2단지');
		expect(document.querySelector('[data-testid="stack-card"]')).toBeNull();
		expect(info.querySelector('[data-testid="stack-back"]')?.textContent).toContain(
			'겹친 단지 3곳으로'
		);

		key(info.querySelector('h3'), 'Escape'); // 정보 → 목록
		await sleep(60);
		flushSync();
		expect(document.querySelector('[data-testid="complex-card"]')).toBeNull();
		expect(document.querySelector('[data-testid="stack-card"] h3')?.textContent).toBe(
			'겹친 단지 3곳'
		);
		expect(
			document.querySelector('[data-testid="stack-card"] button.rm-row[aria-pressed="false"]')
		).not.toBeNull();

		key(document.querySelector('[data-testid="stack-card"] h3'), 'Escape'); // 목록 → 묶음
		await sleep(60);
		flushSync();
		expect(document.querySelector('[data-testid="stack-card"]')).toBeNull();
		expect(cluster().getAttribute('aria-expanded')).toBe('false');
		expect(document.activeElement).toBe(cluster());
		r.unmount();
	});

	it('[겹친 단지 n곳으로] 링크와 닫기 버튼도 같은 단계로 돌아간다', async () => {
		await page.viewport(1280, 800);
		const r = await open(STACKED.slice(0, 3));
		cluster().click();
		await sleep(60);
		flushSync();
		(document.querySelector('[data-testid="stack-card"] button.rm-row') as HTMLElement).click();
		await sleep(60);
		flushSync();
		(document.querySelector('[data-testid="stack-back"]') as HTMLElement).click();
		await sleep(60);
		flushSync();
		expect(document.querySelector('[data-testid="stack-card"]')).not.toBeNull();
		(document.querySelector('[data-testid="stack-card"] .x') as HTMLElement).click();
		await sleep(60);
		flushSync();
		expect(document.querySelector('[data-testid="stack-card"]')).toBeNull();
		r.unmount();
	});

	it('최대 확대가 아닌 묶음은 목록이 아니라 확대(fitBounds)를 한다', async () => {
		await page.viewport(1280, 800);
		const r = await open(STACKED);
		// 먼 단지가 있으면 처음엔 낮은 줌 — 묶음(aria-label)은 확대를 안내한다
		const cl = cluster();
		expect(cl.dataset.stack).toBeUndefined();
		expect(cl.getAttribute('aria-label')).toContain('누르면 확대해요');
		cl.click();
		await sleep(60);
		flushSync();
		expect(document.querySelector('[data-testid="stack-card"]')).toBeNull();
		r.unmount();
	});

	it('겹친 목록이 열린 채 등급을 끄면 숨긴 단지가 빠지고, 다시 켜면 복원된다', async () => {
		await page.viewport(1280, 800);
		const r = await open(STACKED.slice(0, 3));
		cluster().click();
		await sleep(60);
		flushSync();
		const card = document.querySelector('[data-testid="stack-card"]') as HTMLElement;
		expect(card.querySelector('h3')?.textContent).toBe('겹친 단지 3곳');
		expect(card.querySelectorAll('button.rm-row')).toHaveLength(3);
		const sub = card.querySelector('.sub')?.textContent ?? '';
		expect(sub).toMatch(/ · /);
		expect(sub).not.toMatch(/최우선·|일반·|참고·|후보·/);

		(document.querySelector('.rm-lc[data-g="ref"]') as HTMLButtonElement).click();
		await sleep(60);
		flushSync();
		const card2 = document.querySelector('[data-testid="stack-card"]') as HTMLElement;
		expect(card2.querySelector('h3')?.textContent).toBe('겹친 단지 2곳');
		expect(card2.querySelectorAll('button.rm-row')).toHaveLength(2);
		expect(card2.textContent).not.toContain('정자역 상가주택');

		(document.querySelector('.rm-lc[data-g="target"]') as HTMLButtonElement).click();
		await sleep(60);
		flushSync();
		// 보이는 곳이 2곳 미만이면 목록은 그리지 않지만, 원래 id는 유지한다
		expect(document.querySelector('[data-testid="stack-card"]')).toBeNull();

		(document.querySelector('.rm-lc[data-g="target"]') as HTMLButtonElement).click();
		await sleep(60);
		flushSync();
		const card3 = document.querySelector('[data-testid="stack-card"]') as HTMLElement;
		expect(card3).not.toBeNull();
		expect(card3.querySelector('h3')?.textContent).toBe('겹친 단지 2곳');
		expect(card3.querySelectorAll('button.rm-row')).toHaveLength(2);
		expect(card3.textContent).toContain('정자역 2단지');
		expect(card3.textContent).not.toContain('정자역 상가주택');

		(document.querySelector('.rm-lc[data-g="ref"]') as HTMLButtonElement).click();
		await sleep(60);
		flushSync();
		const card4 = document.querySelector('[data-testid="stack-card"]') as HTMLElement;
		expect(card4.querySelector('h3')?.textContent).toBe('겹친 단지 3곳');
		expect(card4.querySelectorAll('button.rm-row')).toHaveLength(3);
		expect(card4.textContent).toContain('정자역 상가주택');
		r.unmount();
	});
});

describe('겹친 단지 목록 — 모바일 v1.7.6 시트', () => {
	it('묶음 → 시트 목록 → 행 → 정보(돌아가기 있음) → Esc 목록 → Esc 닫고 묶음으로 포커스', async () => {
		await page.viewport(414, 896);
		const r = await open(STACKED.slice(0, 3));
		cluster().click();
		await sleep(80);
		flushSync();
		expect(document.querySelector('[data-testid="stack-card"]')).toBeNull(); // 모바일은 카드 대신 시트
		const sheet = document.querySelector('[data-testid="stack-sheet"]') as HTMLElement;
		expect(sheet).not.toBeNull();
		expect(document.querySelector('.sheet-head, [role="dialog"]')?.textContent).toContain(
			'겹친 단지 3곳'
		);
		expect(sheet.querySelectorAll('button.rm-row')).toHaveLength(3);

		(sheet.querySelectorAll('button.rm-row')[0] as HTMLElement).click();
		await sleep(80);
		flushSync();
		expect(document.querySelector('[data-testid="stack-sheet"]')).toBeNull();
		expect(document.body.textContent).toContain('정자역 1단지');
		expect(document.querySelector('[data-testid="stack-back"]')?.textContent).toContain(
			'겹친 단지 3곳으로'
		);

		key(document.activeElement, 'Escape'); // 정보 → 목록(시트는 열린 채)
		await sleep(80);
		flushSync();
		expect(document.querySelector('[data-testid="stack-sheet"]')).not.toBeNull();

		key(document.activeElement, 'Escape'); // 목록 → 닫기, 묶음으로 포커스
		await sleep(120);
		flushSync();
		expect(document.querySelector('[data-testid="stack-sheet"]')).toBeNull();
		expect(document.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull();
		expect(document.activeElement).toBe(cluster());
		r.unmount();
	});
});
