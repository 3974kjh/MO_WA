/**
 * 지도 청크 import()가 멈추면 8초(시험에서는 짧은 한도) 뒤 기존 로드 실패 폴백으로 넘어간다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { flushSync } from 'svelte';
import type { ComplexItem } from '$lib/maps/points';
import MapTab from './MapTab.svelte';

const item = (o: Partial<ComplexItem> = {}): ComplexItem => ({
	id: 'a',
	rank: 1,
	name: '가단지',
	region: '경기도 성남시',
	address: null,
	lat: 37.36,
	lng: 127.11,
	households: 900,
	builtYear: 2005,
	mainType: null,
	score: 80,
	rating: 4,
	tier: 'top',
	medPrice: null,
	priceAsOf: null,
	naverUrl: 'https://map.naver.com/p/search/x',
	...o
});

describe('MapTab 청크 한도', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('import()가 응답 없이 걸리면 한도 뒤 로드 실패 폴백(스켈레톤이 남지 않는다)', async () => {
		const r = render(MapTab, {
			items: [item()],
			mapKeyId: 'placeholderKey01',
			watchHref: (id: string) => `/realestate?tab=watch&c=${id}`,
			loadMapChunk: () => new Promise(() => {}),
			chunkTimeoutMs: 40
		});
		flushSync();
		expect(document.querySelector('[data-testid="complex-map"]')?.getAttribute('data-state')).toBe(
			'init'
		);
		await new Promise((res) => setTimeout(res, 80));
		flushSync();
		const el = document.querySelector('[data-testid="complex-map"]') as HTMLElement;
		expect(el?.dataset.state).toBe('load-failed');
		expect(el.textContent).toContain('지도를 불러오지 못했어요');
		expect(document.querySelector('[data-state="init"]')).toBeNull();
		r.unmount();
	});

	it('한도를 넘긴 뒤 늦게 성공해도 폴백이 지도로 바뀌지 않는다', async () => {
		vi.useFakeTimers();
		let finish: (m: { default: never }) => void = () => {};
		const pending = new Promise<{ default: never }>((res) => {
			finish = res;
		});
		const r = render(MapTab, {
			items: [item()],
			mapKeyId: 'placeholderKey01',
			watchHref: (id: string) => `/realestate?tab=watch&c=${id}`,
			loadMapChunk: () => pending,
			chunkTimeoutMs: 8000
		});
		flushSync();
		expect(document.querySelector('[data-testid="complex-map"]')?.getAttribute('data-state')).toBe(
			'init'
		);
		await vi.advanceTimersByTimeAsync(8000);
		flushSync();
		const el = () => document.querySelector('[data-testid="complex-map"]') as HTMLElement;
		expect(el()?.dataset.state).toBe('load-failed');
		expect(el()?.textContent).toContain('지도를 불러오지 못했어요');
		finish({ default: {} as never });
		await Promise.resolve();
		await Promise.resolve();
		flushSync();
		expect(el()?.dataset.state).toBe('load-failed');
		expect(document.querySelector('.rm-map:not(.fb)')).toBeNull();
		r.unmount();
	});
});
