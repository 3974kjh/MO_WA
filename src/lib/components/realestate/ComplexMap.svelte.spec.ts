/**
 * ComplexMap(client): 가짜 SDK·가짜 로더로 상태기계·마커·클러스터·접근성을 본다(실제 네이버 요청 없음).
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { flushSync } from 'svelte';
import { MapLoadError, type NaverLoader } from '$lib/maps/naverLoader';
import type { LocatedItem } from '$lib/maps/points';
import ComplexMap from './ComplexMap.svelte';

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
	const calls = { fitBounds: 0, panTo: 0, destroy: 0, maps: 0 };
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
			opts: { zoom: number }
		) {
			this.zoom = opts.zoom;
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
		constructor(o: { map: FakeMap; icon: { content: HTMLElement } }) {
			this.el = o.icon.content;
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
		removeListener: (arr: L[]) => arr.forEach((l) => ls.splice(ls.indexOf(l), 1))
	};
	const ns = {
		LatLng,
		Point,
		LatLngBounds,
		Marker,
		Map: FakeMap,
		Event,
		Position: { TOP_RIGHT: 3 }
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

describe('ComplexMap', () => {
	it('첫 타일이 오면 ready · 가까운 단지는 묶음, 먼 단지는 핀 · 마커는 이름 있는 버튼', async () => {
		const sdk = fakeSdk();
		const loader = fakeLoader(() => Promise.resolve(sdk.ns));
		const onselect = vi.fn();
		const r = render(ComplexMap, {
			items: ITEMS,
			keyId: KEY,
			selectedId: null,
			onselect,
			loader,
			observe: false
		});
		await tick();
		expect(root().dataset.state).toBe('loading');
		sdk.fire(sdk.map(), 'tilesloaded');
		flushSync();
		expect(root().dataset.state).toBe('ready');
		expect(loader.load).toHaveBeenCalledWith(KEY);
		const cluster = root().querySelector('.cm-cluster')!;
		expect(cluster.getAttribute('aria-label')).toBe('단지 2곳 묶음, 눌러서 확대');
		const pin = root().querySelector('.cm-pin') as HTMLButtonElement;
		expect(pin.tagName).toBe('BUTTON');
		expect(pin.getAttribute('aria-label')).toBe('3번 다단지, 참고');
		expect(pin.textContent).toBe('참');
		expect(pin.getAttribute('aria-pressed')).toBe('false');
		expect(root().dataset.markers).toBe('2');
		expect(root().querySelector('[role="group"]')?.getAttribute('aria-label')).toContain(
			'단지 목록'
		);
		// 클러스터를 누르면 그 영역으로 확대
		(cluster as HTMLButtonElement).click();
		expect(sdk.calls.fitBounds).toBeGreaterThanOrEqual(2);
		// 확대하면 갈라진다
		sdk.map().setZoom(15);
		flushSync();
		expect(root().querySelectorAll('.cm-pin')).toHaveLength(3);
		const top = root().querySelector('.cm-top') as HTMLButtonElement;
		expect(top.textContent).toBe('79');
		expect(top.getAttribute('aria-label')).toBe('1번 가단지, 최우선, 총점 79점');
		top.click();
		expect(onselect).toHaveBeenCalledWith('a');
		r.unmount();
		expect(sdk.calls.destroy).toBeGreaterThan(0);
	});

	it('고른 단지는 묶지 않고 aria-pressed=true · 범례로 구분별 표시를 끈다', async () => {
		const sdk = fakeSdk();
		const r = render(ComplexMap, {
			items: ITEMS,
			keyId: KEY,
			selectedId: 'b',
			onselect: () => {},
			loader: fakeLoader(() => Promise.resolve(sdk.ns)),
			observe: false
		});
		await tick();
		sdk.fire(sdk.map(), 'tilesloaded');
		flushSync();
		const sel = root().querySelector('.is-sel') as HTMLElement;
		expect(sel.dataset.cx).toBe('b');
		expect(sel.getAttribute('aria-pressed')).toBe('true');
		expect(root().querySelector('.cm-cluster')).toBeNull();
		// 처음에는 전체가 보이게 두고, 목록에서 고르면 그 단지로 옮긴다
		expect(sdk.calls.panTo).toBe(0);
		await r.rerender({ selectedId: 'c' });
		flushSync();
		expect(sdk.calls.panTo).toBe(1);
		expect((root().querySelector('.is-sel') as HTMLElement).dataset.cx).toBe('c');
		const legend = [...root().querySelectorAll('.lgb')] as HTMLButtonElement[];
		expect(legend.map((b) => b.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
			'최우선 1곳',
			'관심 1곳',
			'참고 1곳'
		]);
		expect(legend[1].getAttribute('aria-pressed')).toBe('true');
		legend[1].click();
		flushSync();
		expect(legend[1].getAttribute('aria-pressed')).toBe('false');
		expect(root().querySelector('.cm-pin.cm-target')).toBeNull();
		expect(root().querySelector('.cm-pin.cm-top')).not.toBeNull();
		r.unmount();
	});

	it('첫 타일이 시간 안에 안 오면 timeout 폴백(빈 지도 대신) + 다시 시도', async () => {
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
		expect(sdk.calls.destroy).toBe(1);
		const retry = [...fb.querySelectorAll('button')].find((b) =>
			b.textContent?.includes('다시 시도')
		)!;
		retry.click();
		await tick();
		expect(loader.loads).toBe(2);
		sdk.fire(sdk.map(), 'tilesloaded');
		flushSync();
		expect(root().dataset.state).toBe('ready');
		r.unmount();
	});

	it('인증 실패는 지도를 만든 뒤에 와도 폴백(다시 시도 없음, 지도 정리)', async () => {
		const sdk = fakeSdk();
		const loader = fakeLoader(() => Promise.resolve(sdk.ns));
		const r = render(ComplexMap, {
			items: ITEMS,
			keyId: KEY,
			selectedId: null,
			onselect: () => {},
			loader,
			observe: false
		});
		await tick();
		sdk.fire(sdk.map(), 'tilesloaded');
		flushSync();
		loader.auth();
		flushSync();
		expect(root().dataset.state).toBe('auth-failed');
		expect(root().dataset.markers).toBe('0');
		expect(root().querySelector('.cm-pin')).toBeNull();
		const fb = root().querySelector('[data-testid="map-fallback"]')!;
		expect(fb.textContent).toContain('지도 사용 허용 설정에 문제가 있는 것 같아요');
		expect(fb.querySelector('button')).toBeNull();
		expect(fb.textContent).not.toMatch(/ncp|PUBLIC_|KEY/i);
		r.unmount();
	});

	it.each([
		['timeout', '8초 안에 열리지 않았어요'],
		['load-failed', '지도를 불러오지 못했어요'],
		['offline', '인터넷에 연결되어 있지 않아요']
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
