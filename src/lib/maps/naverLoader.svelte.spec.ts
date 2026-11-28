/**
 * 네이버 지도 SDK 로더(client). 비활성 문서(createHTMLDocument)에 태그를 붙여 실제 네트워크 요청 없이
 * onload·onerror·인증 실패·시간 초과를 손으로 일으킨다. 키는 자리 표시 값만 쓴다.
 */
import { describe, expect, it } from 'vitest';
import {
	createNaverLoader,
	failReason,
	mapsScriptUrl,
	normalizeKeyId,
	PRECONNECT_HOSTS,
	type LoaderEnv
} from './naverLoader';

const KEY = 'placeholderKey01';

function setup(over: Partial<LoaderEnv> = {}) {
	const doc = document.implementation.createHTMLDocument('t');
	const win: LoaderEnv['win'] = { navigator: { onLine: true } };
	const timers: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
	const loader = createNaverLoader({
		doc,
		win,
		setTimer: (fn, ms) => {
			const t = { fn, ms, cleared: false };
			timers.push(t);
			return t;
		},
		clearTimer: (t) => ((t as { cleared: boolean }).cleared = true),
		...over
	});
	const scripts = () => [...doc.head.querySelectorAll('script')] as HTMLScriptElement[];
	const fireTimer = () => timers.filter((t) => !t.cleared).forEach((t) => t.fn());
	return { doc, win, loader, scripts, timers, fireTimer };
}

describe('naverLoader', () => {
	it('키가 없거나 모양이 이상하면 태그·요청 없이 nokey', async () => {
		for (const k of [null, undefined, '', '   ', 'a b c d', '<script>', 'x'.repeat(65)]) {
			const { loader, scripts, doc } = setup();
			await expect(loader.load(k)).rejects.toMatchObject({ reason: 'nokey' });
			expect(scripts()).toHaveLength(0);
			expect(doc.head.querySelectorAll('link')).toHaveLength(0);
		}
		expect(normalizeKeyId(`  ${KEY} `)).toBe(KEY);
	});

	it('ncpKeyId 하나만 쓰는 URL(구 ncpClientId·callback 없음)', () => {
		const u = new URL(mapsScriptUrl(KEY));
		expect(u.origin + u.pathname).toBe('https://oapi.map.naver.com/openapi/v3/maps.js');
		expect([...u.searchParams.keys()]).toEqual(['ncpKeyId']);
		expect(u.searchParams.get('ncpKeyId')).toBe(KEY);
	});

	it('한 번만 붙인다: 동시 호출은 같은 약속 · 인증 훅은 태그보다 먼저 · 미리 연결은 그때만', async () => {
		const { loader, scripts, win, doc } = setup();
		expect(win.navermap_authFailure).toBeUndefined();
		const p1 = loader.load(KEY);
		const p2 = loader.load(KEY);
		expect(p1).toBe(p2);
		expect(scripts()).toHaveLength(1);
		expect(typeof win.navermap_authFailure).toBe('function');
		expect(
			[...doc.head.querySelectorAll('link[rel=preconnect]')].map((l) => l.getAttribute('href'))
		).toEqual([...PRECONNECT_HOSTS]);
		const ns = { Map: function () {} };
		win.naver = { maps: ns };
		scripts()[0].onload?.(new Event('load'));
		await expect(p1).resolves.toBe(ns);
		// 이미 받은 뒤에는 새 태그 없이 같은 것
		await expect(loader.load(KEY)).resolves.toBe(ns);
		expect(scripts()).toHaveLength(1);
	});

	it('시간 제한: timeout으로 실패하고 태그를 지운다 → 다시 시도하면 새 태그', async () => {
		const { loader, scripts, fireTimer, timers } = setup();
		const p = loader.load(KEY);
		expect(timers[0].ms).toBe(8000);
		fireTimer();
		await expect(p).rejects.toMatchObject({ reason: 'timeout' });
		expect(scripts()).toHaveLength(0);
		const p2 = loader.load(KEY);
		expect(p2).not.toBe(p);
		expect(scripts()).toHaveLength(1);
		p2.catch(() => {});
	});

	it('스크립트 오류는 load-failed, 오프라인이면 offline', async () => {
		const a = setup();
		const p = a.loader.load(KEY);
		a.scripts()[0].onerror?.(new Event('error'));
		await expect(p).rejects.toMatchObject({ reason: 'load-failed' });
		expect(a.scripts()).toHaveLength(0);

		const b = setup();
		const q = b.loader.load(KEY);
		b.win.navigator!.onLine = false;
		b.scripts()[0].onerror?.(new Event('error'));
		await expect(q).rejects.toMatchObject({ reason: 'offline' });
		// 처음부터 오프라인이면 태그를 붙이지 않는다
		await expect(b.loader.load(KEY)).rejects.toMatchObject({ reason: 'offline' });
		expect(b.scripts()).toHaveLength(0);
	});

	it('onload 뒤 naver.maps가 없으면 load-failed', async () => {
		const { loader, scripts } = setup();
		const p = loader.load(KEY);
		scripts()[0].onload?.(new Event('load'));
		await expect(p).rejects.toMatchObject({ reason: 'load-failed' });
	});

	it('인증 실패: 로드 중이면 auth-failed로 끝나고, 로드 뒤에 와도 구독자에게 알린다', async () => {
		const { loader, scripts, win } = setup();
		let prevCalled = 0;
		win.navermap_authFailure = () => prevCalled++;
		const p = loader.load(KEY);
		win.navermap_authFailure!();
		await expect(p).rejects.toMatchObject({ reason: 'auth-failed' });
		expect(prevCalled).toBe(1);
		expect(scripts()).toHaveLength(0);
		expect(loader.authFailed).toBe(true);
		// 같은 키로 다시 불러도 요청하지 않는다
		await expect(loader.load(KEY)).rejects.toMatchObject({ reason: 'auth-failed' });
		expect(scripts()).toHaveLength(0);
		let late = 0;
		loader.onAuthFailure(() => late++);
		expect(late).toBe(1);

		const b = setup();
		const q = b.loader.load(KEY);
		b.win.naver = { maps: {} };
		b.scripts()[0].onload?.(new Event('load'));
		await q;
		let n = 0;
		const off = b.loader.onAuthFailure(() => n++);
		b.win.navermap_authFailure!();
		expect(n).toBe(1);
		off();
		b.win.navermap_authFailure!();
		expect(n).toBe(1);
	});

	it('failReason: 모르는 오류는 load-failed', () => {
		expect(failReason(new Error('x'))).toBe('load-failed');
	});
});
