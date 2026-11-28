/**
 * ComplexMap(client): 가짜 SDK·가짜 로더로 상태기계·마커·클러스터·접근성을 본다(실제 네이버 요청 없음).
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { flushSync } from 'svelte';
import { MapLoadError, type NaverLoader } from '$lib/maps/naverLoader';
import type { LocatedItem } from '$lib/maps/points';
import ComplexMap, { WHEEL_HINT_MS } from './ComplexMap.svelte';

const KEY = 'placeholderKey01';

const item = (o: Partial<LocatedItem>): LocatedItem => ({
	id: 'x',
	rank: 1,
	name: '단지',
	region: '경기도 파주시',
	address: null,
	lat: 37.7,
	lng: 126.73,
	households: 1000,
	builtYear: 2020,
	mainType: null,
	score: 70,
	rating: 3.5,
	tier: 'target',
	medPrice: null,
	priceAsOf: null,
	naverUrl: 'https://map.naver.com/p/search/x',
	...o
});

const ITEMS: LocatedItem[] = [
	item({
		id: 'a',
		rank: 1,
		name: '가단지',
		score: 78.6,
		rating: 4,
		tier: 'top',
		lat: 37.7,
		lng: 126.73
	}),
	item({ id: 'b', rank: 2, name: '나단지', score: 70, lat: 37.701, lng: 126.731 }),
	item({
		id: 'c',
		rank: 3,
		name: '다단지',
		score: null,
		rating: null,
		tier: 'ref',
		lat: 37.0,
		lng: 127.1
	})
];

type L = { t: unknown; n: string; f: () => void };

function fakeSdk() {
	const ls: L[] = [];
	const fire = (t: unknown, n: string) =>
		ls.filter((l) => l.t === t && l.n === n).forEach((l) => l.f());
	const calls = { fitBounds: 0, panTo: 0, panBy: 0, destroy: 0, maps: 0 };
	const holder: { current: FakeMap | null } = { current: null };
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
	class FakeMap {
		zoom: number;
		constructor(
			public el: HTMLElement,
			opts: { zoom: number } & Record<string, unknown>
		) {
			this.zoom = opts.zoom;
			this.options = opts;
			calls.maps++;
			holder.current = this;
		}
		getZoom() {
			return this.zoom;
		}
		setZoom(z: number) {
			this.zoom = z;
			fire(this, 'zoom_changed');
		}
		setCenter() {}
		options: Record<string, unknown>;
		getBounds() {
			return { hasLatLng: () => true };
		}
		getProjection() {
			// 줌 z에서 경도 1도 = 2^z 픽셀 정도의 단순 투영(거리 기반 묶음 시험용)
			const k = 2 ** this.zoom;
			return { fromCoordToOffset: (c: LatLng) => ({ x: c.lng * k, y: -c.lat * k }) };
		}
		panBy() {
			calls.panBy++;
		}
		fitBounds() {
			calls.fitBounds++;
		}
		panTo() {
			calls.panTo++;
		}
		destroy() {
			calls.destroy++;
		}
	}
	class Marker {
		el: HTMLElement;
		constructor(o: {
			map: FakeMap;
			position: LatLng;
			icon: { content: HTMLElement };
			zIndex?: number;
		}) {
			this.el = o.icon.content;
			this.el.style.position = 'absolute';
			this.el.style.left = `${(o.position.lng - 126.5) * 3000}px`;
			this.el.style.top = `${(38 - o.position.lat) * 3000}px`;
			if (o.zIndex != null) this.el.style.zIndex = String(o.zIndex);
			o.map.el.append(this.el);
		}
		setMap(m: unknown) {
			if (!m) this.el.remove();
		}
	}
	const Event = {
		once: (t: unknown, n: string, f: () => void) => {
			const l = { t, n, f };
			ls.push(l);
			return l;
		},
		addListener: (t: unknown, n: string, f: () => void) => {
			const l = { t, n, f };
			ls.push(l);
			return l;
		},
		removeListener: (arr: L[]) => arr.forEach((l) => ls.splice(ls.indexOf(l), 1)),
		trigger: () => {}
	};
	const ns = {
		LatLng,
		Point,
		LatLngBounds,
		Marker,
		Map: FakeMap,
		Event,
		Position: { TOP_RIGHT: 3, BOTTOM_RIGHT: 5, BOTTOM_LEFT: 4 }
	};
	return { ns, fire, calls, map: () => holder.current! };
}

function fakeLoader(result: () => Promise<unknown>) {
	let authCb: (() => void) | null = null;
	const loader: NaverLoader & { auth(): void; loads: number } = {
		loads: 0,
		load: vi.fn(() => {
			loader.loads++;
			return result();
		}),
		onAuthFailure(cb) {
			authCb = cb;
			return () => (authCb = null);
		},
		get authFailed() {
			return false;
		},
		auth() {
			authCb?.();
		}
	};
	return loader;
}

const root = () => document.querySelector('[data-testid="complex-map"]') as HTMLElement;
const tick = () => new Promise((r) => setTimeout(r, 0));
const box = () => root().querySelector('[role="group"]') as HTMLElement;
const pins = () => [...root().querySelectorAll('.rm-pin')] as HTMLButtonElement[];
const key = (el: Element, k: string, o: KeyboardEventInit = {}) =>
	el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));

/** 가까운 둘(a,b)·먼 하나(c)를 쓰는 기본 화면 */
async function mount(props: Record<string, unknown> = {}, sdk = fakeSdk()) {
	const onselect = vi.fn();
	const ondeselect = vi.fn();
	const onsay = vi.fn();
	const loader = fakeLoader(() => Promise.resolve(sdk.ns));
	const r = render(ComplexMap, {
		items: ITEMS,
		keyId: KEY,
		selectedId: null,
		onselect,
		ondeselect,
		onsay,
		loader,
		observe: false,
		...props
	});
	await tick();
	sdk.fire(sdk.map(), 'tilesloaded');
	flushSync();
	return { r, sdk, onselect, ondeselect, onsay, loader };
}

/** 십자 배치(가운데·동·서·북) — 방향키 이동 시험용. 3000px/도 → 60px 간격 */
const CROSS: LocatedItem[] = [
	item({ id: 'mid', name: '가운데', lat: 37.5, lng: 127.0, tier: 'top', score: 80 }),
	item({ id: 'east', name: '동쪽', lat: 37.5, lng: 127.02, tier: 'target' }),
	item({ id: 'west', name: '서쪽', lat: 37.5, lng: 126.98, tier: 'cand', score: null }),
	item({ id: 'north', name: '북쪽', lat: 37.52, lng: 127.0, tier: 'ref', score: null })
];

describe('ComplexMap 상태·마커', () => {
	it('첫 타일이 오면 ready · SDK 옵션은 휠·키보드 단축키 끔 · 가까운 단지는 묶음, 먼 단지는 핀', async () => {
		const { r, sdk, loader } = await mount();
		expect(root().dataset.state).toBe('ready');
		expect(loader.load).toHaveBeenCalledWith(KEY);
		expect(sdk.map().options.scrollWheel).toBe(false);
		expect(sdk.map().options.keyboardShortcuts).toBe(false);
		expect(sdk.map().options.zoomControl).toBe(false);
		const cl = root().querySelector('.rm-cl') as HTMLButtonElement;
		expect(cl.getAttribute('aria-label')).toBe('단지 2곳 묶음, 최우선 1곳 포함. 누르면 확대해요');
		expect(cl.querySelector('.star')).not.toBeNull();
		expect(cl.textContent).toBe('2');
		expect(pins()).toHaveLength(1);
		expect(pins()[0].getAttribute('aria-label')).toBe('다단지, 참고, 경기도 파주시');
		expect(root().dataset.markers).toBe('2');
		cl.click();
		expect(sdk.calls.fitBounds).toBeGreaterThanOrEqual(2);
		r.unmount();
		expect(sdk.calls.destroy).toBeGreaterThan(0);
	});

	it('모든 핀·묶음의 누름 영역이 44×44 이상이고 등급별 모양·글자가 다르다', async () => {
		const sdk = fakeSdk();
		const { r } = await mount({ items: CROSS }, sdk);
		sdk.map().setZoom(16);
		flushSync();
		expect(pins()).toHaveLength(4);
		for (const p of pins()) {
			const b = p.getBoundingClientRect();
			expect(b.width).toBeGreaterThanOrEqual(44);
			expect(b.height).toBeGreaterThanOrEqual(44);
		}
		const by = (c: string) => root().querySelector(`.rm-pin.g-${c}`)!;
		expect(by('top').querySelector('path.fl')).not.toBeNull(); // 물방울
		expect(by('top').querySelector('.sp')).not.toBeNull(); // 별 배지
		expect(by('top').querySelector('text')?.textContent).toBe('80');
		expect(by('target').querySelector('.sp')).toBeNull();
		expect(by('cand').querySelector('rect.fl')).not.toBeNull(); // 마름모
		expect(by('cand').querySelector('text')?.textContent).toBe('후');
		expect(by('ref').querySelector('circle.fl')).not.toBeNull(); // 원
		expect(by('ref').querySelector('text')?.textContent).toBe('참');
		expect(by('top').getAttribute('aria-label')).toBe('가운데, 최우선, 총점 80점, 경기도 파주시');
		const cl = [...root().querySelectorAll('.rm-cl')];
		expect(cl).toHaveLength(0);
		r.unmount();
	});

	it('고른 단지는 묶음에서 빠져 aria-pressed=true와 이름 라벨로 따로 그려진다', async () => {
		const { r } = await mount({ selectedId: 'b' });
		const sel = root().querySelector('.rm-pin.sel') as HTMLElement;
		expect(sel.dataset.id).toBe('b');
		expect(sel.getAttribute('aria-pressed')).toBe('true');
		expect(sel.querySelector('.rm-lab')?.textContent).toBe('나단지');
		expect(root().querySelector('.rm-cl')).toBeNull();
		r.unmount();
	});

	it('끈 등급은 지도에서 빠지고, 전부 끄면 안내와 [모든 등급 켜기]', async () => {
		const onallon = vi.fn();
		const { r } = await mount({ hidden: ['top', 'target', 'ref'], onallon });
		expect(pins()).toHaveLength(0);
		expect(root().textContent).toContain('보이는 단지가 없어요');
		expect(root().textContent).toContain('표시할 단지 없음');
		const btn = [...root().querySelectorAll('button')].find((b) =>
			b.textContent?.includes('모든 등급 켜기')
		)!;
		btn.click();
		expect(onallon).toHaveBeenCalledOnce();
		r.unmount();
	});

	it('로딩 중에는 안내와 [목록 먼저 보기]', async () => {
		const onlist = vi.fn();
		const sdk = fakeSdk();
		const r = render(ComplexMap, {
			items: ITEMS,
			keyId: KEY,
			selectedId: null,
			onselect: () => {},
			onlist,
			loader: fakeLoader(() => new Promise(() => {})),
			observe: false
		});
		await tick();
		void sdk;
		expect(root().dataset.state).toBe('loading');
		expect(root().textContent).toContain('지도를 불러오는 중이에요');
		expect(root().textContent).toContain('단지 목록은 지금도 볼 수 있어요.');
		[...root().querySelectorAll('button')]
			.find((b) => b.textContent?.includes('목록 먼저 보기'))!
			.click();
		expect(onlist).toHaveBeenCalledOnce();
		r.unmount();
	});
});

describe('ComplexMap 키보드', () => {
	it('핀 영역은 탭 정지 하나(roving) · 방향키는 그 방향의 가까운 이웃으로', async () => {
		const sdk = fakeSdk();
		const { r } = await mount({ items: CROSS }, sdk);
		sdk.map().setZoom(16);
		flushSync();
		const tabStops = () => pins().filter((p) => p.tabIndex === 0);
		expect(tabStops()).toHaveLength(1);
		const mid = root().querySelector('[data-id="mid"]') as HTMLButtonElement;
		const at = (id: string) => root().querySelector(`[data-id="${id}"]`) as HTMLButtonElement;
		mid.focus();
		key(mid, 'ArrowRight');
		expect(document.activeElement).toBe(at('east'));
		expect(tabStops()).toEqual([at('east')]);
		key(at('east'), 'ArrowLeft');
		expect(document.activeElement).toBe(mid);
		key(mid, 'ArrowLeft');
		expect(document.activeElement).toBe(at('west'));
		key(at('west'), 'ArrowRight');
		key(mid, 'ArrowUp');
		expect(document.activeElement).toBe(at('north'));
		key(at('north'), 'ArrowUp'); // 가장자리: 그대로
		expect(document.activeElement).toBe(at('north'));
		key(at('north'), 'ArrowDown');
		expect(document.activeElement).toBe(mid);
		r.unmount();
	});

	it('Home/End는 목록 순서의 처음·끝, Enter(클릭)는 열기, 방향키는 페이지를 안 밀어낸다', async () => {
		const sdk = fakeSdk();
		const { r, onselect } = await mount({ items: CROSS }, sdk);
		sdk.map().setZoom(16);
		flushSync();
		const at = (id: string) => root().querySelector(`[data-id="${id}"]`) as HTMLButtonElement;
		at('east').focus();
		key(at('east'), 'Home');
		expect(document.activeElement).toBe(at('mid'));
		key(at('mid'), 'End');
		expect(document.activeElement).toBe(at('north'));
		const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
		at('north').dispatchEvent(ev);
		expect(ev.defaultPrevented).toBe(true);
		at('east').click();
		expect(onselect).toHaveBeenCalledWith('east', { focus: false });
		r.unmount();
	});

	it('+/−는 확대·축소, Shift+방향키는 지도를 민다', async () => {
		const sdk = fakeSdk();
		const { r, onsay } = await mount({ items: CROSS }, sdk);
		sdk.map().setZoom(12);
		flushSync();
		const p = pins()[0] ?? (root().querySelector('.rm-cl') as HTMLElement);
		key(p, '+');
		expect(sdk.map().getZoom()).toBe(13);
		key(p, '-');
		key(p, '_');
		expect(sdk.map().getZoom()).toBe(11);
		expect(onsay).toHaveBeenCalledWith('지도를 확대했어요.');
		key(p, 'ArrowLeft', { shiftKey: true });
		expect(sdk.calls.panBy).toBe(1);
		r.unmount();
	});

	it('Esc는 닫고 같은 핀으로 포커스를 돌려 준다', async () => {
		await page.viewport(1280, 800);
		const sdk = fakeSdk();
		const { r, ondeselect } = await mount({ items: CROSS, selectedId: 'mid' }, sdk);
		sdk.map().setZoom(16);
		flushSync();
		const mid = root().querySelector('[data-id="mid"]') as HTMLButtonElement;
		expect(root().querySelector('[data-testid="complex-card"] h3')?.textContent).toBe('가운데');
		(document.querySelector('[data-testid="complex-card"] .x') as HTMLElement).focus();
		key(box().querySelector('.x')!, 'Escape'); // 카드 안에서 눌러도 상위가 처리(핀이 아니어도 Esc)
		await tick();
		expect(ondeselect).toHaveBeenCalledWith(true);
		expect(document.activeElement).toBe(mid);
		r.unmount();
	});
});

describe('ComplexMap Ctrl/⌘+휠 확대', () => {
	const wheel = (el: Element, o: WheelEventInit) => {
		const ev = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, ...o });
		el.dispatchEvent(ev);
		return ev;
	};

	it('Ctrl+휠은 확대(브라우저 확대는 막음), ⌘+휠은 축소, 연속 이벤트는 한 번만', async () => {
		await page.viewport(1280, 800);
		const sdk = fakeSdk();
		const { r } = await mount({}, sdk);
		const z0 = sdk.map().getZoom();
		const a = wheel(box(), { ctrlKey: true });
		expect(a.defaultPrevented).toBe(true);
		expect(sdk.map().getZoom()).toBe(z0 + 1);
		wheel(box(), { ctrlKey: true }); // 120ms 안: 무시
		expect(sdk.map().getZoom()).toBe(z0 + 1);
		await new Promise((res) => setTimeout(res, 140));
		const b = wheel(box(), { metaKey: true, deltaY: 100 });
		expect(b.defaultPrevented).toBe(true);
		expect(sdk.map().getZoom()).toBe(z0);
		r.unmount();
	});

	it('휠만 돌리면 페이지가 스크롤되고(막지 않음) 안내가 1.6초 뜬다', async () => {
		await page.viewport(1280, 800);
		const sdk = fakeSdk();
		const { r } = await mount({}, sdk);
		const z0 = sdk.map().getZoom();
		const ev = wheel(box(), {});
		expect(ev.defaultPrevented).toBe(false);
		expect(sdk.map().getZoom()).toBe(z0);
		flushSync();
		expect(root().querySelector('[data-testid="wheel-hint"]')?.textContent).toContain(
			'지도를 확대·축소하려면 Ctrl 키를 누른 채 스크롤하세요'
		);
		expect(WHEEL_HINT_MS).toBe(1600);
		await new Promise((res) => setTimeout(res, WHEEL_HINT_MS + 100));
		flushSync();
		expect(root().querySelector('[data-testid="wheel-hint"]')).toBeNull();
		r.unmount();
	});

	it('모바일은 안내 없이 페이지 스크롤 그대로(휠 이벤트가 없음)', async () => {
		await page.viewport(414, 896);
		const { r } = await mount();
		wheel(box(), {});
		flushSync();
		expect(root().querySelector('[data-testid="wheel-hint"]')).toBeNull();
		r.unmount();
	});
});

describe('ComplexMap 카드', () => {
	it('PC는 핀에 붙는 카드(제목·닫기·네이버 링크), 모바일은 카드 없음(시트는 페이지)', async () => {
		await page.viewport(1280, 800);
		const sdk = fakeSdk();
		const a = await mount(
			{ items: CROSS, selectedId: 'east', watchHref: (id: string) => `/w?c=${id}` },
			sdk
		);
		const card = root().querySelector('[data-testid="complex-card"]')!;
		expect(card.querySelector('h3')?.textContent).toBe('동쪽');
		expect(card.getAttribute('aria-labelledby')).toBe('rm-iw-t');
		expect(card.querySelector('a[href^="https://map.naver.com/p/search/"]')).not.toBeNull();
		expect(card.querySelector('a[href="/w?c=east"]')?.textContent).toContain('점수 근거 보기');
		a.r.unmount();
		await page.viewport(414, 896);
		const b = await mount({ items: CROSS, selectedId: 'east' });
		expect(root().querySelector('[data-testid="complex-card"]')).toBeNull();
		b.r.unmount();
	});
});

describe('ComplexMap 실패·재시도', () => {
	it('첫 타일이 시간 안에 안 오면 timeout 폴백(빈 지도 대신) + 다시 시도하기', async () => {
		const sdk = fakeSdk();
		const loader = fakeLoader(() => Promise.resolve(sdk.ns));
		const r = render(ComplexMap, {
			items: ITEMS,
			keyId: KEY,
			selectedId: null,
			onselect: () => {},
			loader,
			observe: false,
			tileTimeoutMs: 10
		});
		await new Promise((res) => setTimeout(res, 40));
		flushSync();
		expect(root().dataset.state).toBe('timeout');
		const fb = root().querySelector('[data-testid="map-fallback"]')!;
		expect(fb.getAttribute('data-reason')).toBe('timeout');
		expect(fb.textContent).toContain('8초 안에 열리지 않았어요');
		expect(sdk.calls.destroy).toBe(1);
		[...fb.querySelectorAll('button')]
			.find((b) => b.textContent?.includes('다시 시도하기'))!
			.click();
		await tick();
		expect(loader.loads).toBe(2);
		sdk.fire(sdk.map(), 'tilesloaded');
		flushSync();
		expect(root().dataset.state).toBe('ready');
		r.unmount();
	});

	it('인증 실패: 지도를 만든 뒤에 와도 폴백(role=alert, 지도 정리), 다시 시도하기는 페이지를 다시 불러오고 관리자·설정 문구가 없다', async () => {
		const reloadPage = vi.fn();
		const onstatus = vi.fn();
		const { r, sdk, loader } = await mount({ reloadPage, onstatus });
		loader.auth();
		flushSync();
		expect(root().dataset.state).toBe('auth-failed');
		expect(onstatus).toHaveBeenLastCalledWith('auth-failed');
		expect(root().dataset.markers).toBe('0');
		expect(root().querySelector('.rm-pin')).toBeNull();
		expect(sdk.calls.destroy).toBeGreaterThan(0);
		const fb = root().querySelector('[data-testid="map-fallback"]')!;
		expect(fb.getAttribute('role')).toBe('alert');
		expect(fb.querySelector('.t')?.textContent).toBe('지도를 불러오지 못했어요');
		expect(fb.textContent).toContain(
			'지도를 쓸 수 있는 상태가 아닌 것 같아요. 잠시 뒤 다시 시도해 주세요.'
		);
		expect(fb.textContent).toContain('‘네이버 지도에서 보기’ 링크로 위치를 볼 수 있어요');
		expect(fb.querySelector('details')).toBeNull(); // 허용 URL·관리자를 가리키는 설명 없음
		expect(fb.textContent).not.toMatch(/관리자|허용 목록|등록/);
		expect(fb.textContent).not.toMatch(/ncp|PUBLIC_|KEY|navermap/i);
		[...fb.querySelectorAll('button')]
			.find((b) => b.textContent?.includes('다시 시도하기'))!
			.click();
		expect(reloadPage).toHaveBeenCalledOnce();
		expect(loader.loads).toBe(1); // 인증 실패는 SDK 재요청이 아니라 페이지를 새로 받는다
		r.unmount();
	});

	it.each([
		['timeout', '8초 안에 열리지 않았어요'],
		['load-failed', '지도를 불러오지 못했어요'],
		['offline', '인터넷에 연결되어 있지 않은 것 같아요']
	] as const)('로더 실패 %s → 폴백 문구', async (reason, text) => {
		const r = render(ComplexMap, {
			items: ITEMS,
			keyId: KEY,
			selectedId: null,
			onselect: () => {},
			loader: fakeLoader(() => Promise.reject(new MapLoadError(reason))),
			observe: false
		});
		await tick();
		flushSync();
		expect(root().dataset.state).toBe(reason);
		expect(root().textContent).toContain(text);
		// 제목은 모두 같고(관리자·코드 문구 없음), 목록·네이버 링크 안내가 이어진다
		expect(root().querySelector('.t')?.textContent).toBe('지도를 불러오지 못했어요');
		expect(root().textContent).toContain('‘네이버 지도에서 보기’ 링크로 위치를 볼 수 있어요');
		expect(root().textContent).not.toMatch(/관리자|허용 목록|PUBLIC_|ncp/i);
		r.unmount();
	});

	it('SDK가 지도 생성 중 던지면 error 폴백(오류는 console.error, 삼키지 않음)', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		const sdk = fakeSdk();
		const broken = {
			...sdk.ns,
			Map: function () {
				throw new Error('boom');
			}
		};
		const r = render(ComplexMap, {
			items: ITEMS,
			keyId: KEY,
			selectedId: null,
			onselect: () => {},
			loader: fakeLoader(() => Promise.resolve(broken)),
			observe: false
		});
		await tick();
		flushSync();
		expect(root().dataset.state).toBe('error');
		expect(err).toHaveBeenCalled();
		err.mockRestore();
		r.unmount();
	});

	it('보일 때까지 기다린다(observe): 화면 밖이면 로더를 부르지 않는다', async () => {
		const loader = fakeLoader(() => new Promise(() => {}));
		const spacer = document.createElement('div');
		spacer.style.height = '5000px';
		document.body.prepend(spacer);
		const r = render(ComplexMap, {
			items: ITEMS,
			keyId: KEY,
			selectedId: null,
			onselect: () => {},
			loader
		});
		await new Promise((res) => setTimeout(res, 50));
		expect(loader.loads).toBe(0);
		expect(root().dataset.state).toBe('idle');
		spacer.remove();
		await new Promise((res) => setTimeout(res, 100));
		expect(loader.loads).toBe(1);
		r.unmount();
	});
});

describe('ComplexMap 쌓임·한 마감', () => {
	it('PC 앵커 카드는 .canvas 안 높은 zIndex 마커(묶음) 위에 있다', async () => {
		await page.viewport(1280, 800);
		const sdk = fakeSdk();
		// 가짜 SDK 좌표식에서 화면 안(~200,200)에 오는 한 점
		const items = [
			item({
				id: 'east',
				name: '동쪽',
				lat: 37.933,
				lng: 126.567,
				tier: 'target',
				score: 80.4
			})
		];
		const { r } = await mount(
			{ items, selectedId: 'east', watchHref: (id: string) => `/w?c=${id}` },
			sdk
		);
		const host = root();
		host.style.width = '960px';
		host.style.height = '640px';
		(host.querySelector('.box') as HTMLElement).style.height = '640px';
		sdk.fire(sdk.map(), 'idle');
		await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
		flushSync();

		const card = host.querySelector('[data-testid="complex-card"]') as HTMLElement;
		expect(card).not.toBeNull();
		// placeCard가 아직 자리를 못 정해도 쌓임 자체는 보여야 한다
		card.style.visibility = 'visible';
		if (!card.style.left) {
			card.style.left = '80px';
			card.style.top = '80px';
		}
		const btn = [...card.querySelectorAll('a')].find((a) =>
			a.textContent?.includes('점수 근거 보기')
		) as HTMLAnchorElement;
		expect(btn).toBeTruthy();
		const canvas = host.querySelector('.canvas') as HTMLElement;
		const cs = getComputedStyle(canvas);
		expect(cs.isolation === 'isolate' || cs.zIndex !== 'auto').toBe(true);
		expect(Number(getComputedStyle(card).zIndex)).toBeGreaterThan(Number(cs.zIndex) || 0);

		const cl = document.createElement('button');
		cl.className = 'rm-cl';
		cl.type = 'button';
		cl.textContent = '2';
		cl.setAttribute('aria-label', '단지 2곳 묶음');
		const br = btn.getBoundingClientRect();
		const cr = canvas.getBoundingClientRect();
		expect(br.width).toBeGreaterThan(0);
		cl.style.cssText = `position:absolute;z-index:8000;width:48px;height:48px;left:${br.left - cr.left}px;top:${br.top - cr.top}px;background:#333;color:#fff;border:0;border-radius:50%;`;
		canvas.append(cl);

		const x = br.left + br.width / 2;
		const y = br.top + br.height / 2;
		const hit = document.elementFromPoint(x, y);
		const label =
			hit instanceof HTMLElement ? `${hit.tagName}.${hit.className}`.trim() : String(hit);
		expect(hit, `hit=${label} @${x},${y}`).not.toBeNull();
		expect(card.contains(hit) || btn.contains(hit as Node), `hit=${label}`).toBe(true);
		r.unmount();
	});

	it('로더가 걸려도 타일 한도를 넘기면 timeout(스크립트+타일을 이어서 두 배로 기다리지 않는다)', async () => {
		const loader = fakeLoader(() => new Promise(() => {}));
		const t0 = Date.now();
		const r = render(ComplexMap, {
			items: ITEMS,
			keyId: KEY,
			selectedId: null,
			onselect: () => {},
			loader,
			observe: false,
			tileTimeoutMs: 40
		});
		await new Promise((res) => setTimeout(res, 80));
		flushSync();
		expect(root().dataset.state).toBe('timeout');
		expect(Date.now() - t0).toBeLessThan(200);
		r.unmount();
	});

	it('로더가 한도의 일부를 써도 남은 시간만 타일을 기다리고, 합은 한 한도를 넘지 않는다', async () => {
		let resolveNs: (n: unknown) => void = () => {};
		const sdk = fakeSdk();
		const loader = fakeLoader(() => new Promise((res) => (resolveNs = res)));
		const t0 = Date.now();
		const r = render(ComplexMap, {
			items: ITEMS,
			keyId: KEY,
			selectedId: null,
			onselect: () => {},
			loader,
			observe: false,
			tileTimeoutMs: 120
		});
		await new Promise((res) => setTimeout(res, 80));
		resolveNs(sdk.ns);
		// 타일 이벤트를 안 주면 시작 후 ~120ms에 timeout. 이어서 120을 더하면 200ms 뒤에야 폴백이다.
		await new Promise((res) => setTimeout(res, 80));
		flushSync();
		expect(root().dataset.state).toBe('timeout');
		expect(Date.now() - t0).toBeLessThan(250);
		r.unmount();
	});
});
