import { afterEach, describe, expect, it, vi } from 'vitest';
import { largeBriefing, sampleBriefing, sampleGlossary } from '$lib/fixtures/report';
import * as render from './render';
import {
	RENDERER_VERSION,
	createMemoryReportCache,
	renderReportCached,
	reportCacheKey,
	type CachedRender
} from './cache';

afterEach(() => vi.restoreAllMocks());

const report = { id: 'r-1', version: 3, body: sampleBriefing };
const opts = { glossary: sampleGlossary };

describe('리포트 렌더 캐시', () => {
	it('키에 id·version·RENDERER_VERSION이 들어간다', () => {
		const key = reportCacheKey(report, opts);
		expect(key).toContain('r-1');
		expect(key).toContain(':v3:');
		expect(key).toContain(RENDERER_VERSION);
		expect(reportCacheKey(report, {})).not.toBe(key); // 옵션(용어 사전)이 다르면 다른 키
	});
	it('미스 → 렌더 후 저장', async () => {
		const store = createMemoryReportCache();
		const spy = vi.spyOn(render, 'renderReport');
		const r = await renderReportCached(report, store, opts);
		expect(spy).toHaveBeenCalledTimes(1);
		const saved = store.map.get(reportCacheKey(report, opts));
		expect(saved?.bodyBlocks.a).toBe(r.a);
		expect(saved?.toc).toEqual(r.toc);
		expect(r).toEqual(render.renderReport(sampleBriefing, opts));
	});
	it('히트 → 재렌더 없이, sanitize는 다시 돈다', async () => {
		const store = createMemoryReportCache();
		const first = await renderReportCached(report, store, opts);
		const rr = vi.spyOn(render, 'renderReport');
		const rs = vi.spyOn(render, 'resanitizeRendered');
		const second = await renderReportCached(report, store, opts);
		expect(rr).not.toHaveBeenCalled();
		expect(rs).toHaveBeenCalledTimes(2); // a, b
		expect(second).toEqual(first);
	});
	it('version이 바뀌면 미스', async () => {
		const store = createMemoryReportCache();
		await renderReportCached(report, store, opts);
		const spy = vi.spyOn(render, 'renderReport');
		await renderReportCached({ ...report, version: 4, body: '## 새 본문' }, store, opts);
		expect(spy).toHaveBeenCalledTimes(1);
		expect(store.map.size).toBe(2);
	});
	it('변조된 캐시 HTML(script·onerror·javascript:)은 히트에서도 지워진다', async () => {
		const store = createMemoryReportCache();
		const key = reportCacheKey(report, opts);
		const tampered: CachedRender = {
			bodyBlocks: {
				a: '<p>ok</p><script>alert(1)</script><img src=x onerror=alert(1)><img src="/api/mcp"><a href="javascript:alert(1)">j</a><h2 id="h-a" onmouseover="x">A</h2><a href="/\t/evil.example">e</a>',
				b: '<svg onload=alert(1)></svg><iframe src="https://evil.example"></iframe><p style="x">b</p>',
				hasSplit: true
			},
			toc: [
				{ id: 'h-a', text: 'A', level: 2, part: 'A' },
				{ id: '"><script>', text: 'x', level: 2, part: 'A' },
				{ id: 'h-b', text: '', level: 2, part: 'B' }
			]
		};
		await store.set(key, tampered);
		const spy = vi.spyOn(render, 'renderReport');
		const r = await renderReportCached(report, store, opts);
		expect(spy).not.toHaveBeenCalled();
		// script·img(onerror·/api)·javascript: 링크·on* 속성은 빠지고, 우회 href는 외부 링크(새 창 + rel)로 판정된다
		expect(r.a).toBe(
			'<p>ok</p>j<h2 id="h-a">A</h2><a href="/\t/evil.example" target="_blank" rel="noopener noreferrer nofollow">e</a>'
		);
		expect(r.b).toBe('<p>b</p>');
		expect(r.toc).toEqual([{ id: 'h-a', text: 'A', level: 2, part: 'A' }]);
	});
	it('모양이 틀린 캐시 값은 미스로 보고 다시 렌더', async () => {
		const store = createMemoryReportCache();
		const key = reportCacheKey(report, opts);
		store.map.set(key, { bodyBlocks: { a: 1 } } as unknown as CachedRender);
		const spy = vi.spyOn(render, 'renderReport');
		const r = await renderReportCached(report, store, opts);
		expect(spy).toHaveBeenCalledTimes(1);
		expect(r.hasSplit).toBe(true);
	});
	it('고정 문구 대체(상한 초과)는 저장하지 않는다', async () => {
		const store = createMemoryReportCache();
		const r = await renderReportCached(
			{ id: 'big', version: 1, body: 'x'.repeat(render.MAX_REPORT_BYTES + 1) },
			store
		);
		expect(r.fallback).toBe('too-large');
		expect(store.map.size).toBe(0);
	});
	it('40KB 히트 비용(재sanitize) 측정', async () => {
		const store = createMemoryReportCache();
		const big = { id: 'big', version: 1, body: largeBriefing() };
		await renderReportCached(big, store, opts);
		for (let i = 0; i < 3; i++) await renderReportCached(big, store, opts);
		const times: number[] = [];
		for (let i = 0; i < 9; i++) {
			const t0 = performance.now();
			await renderReportCached(big, store, opts);
			times.push(performance.now() - t0);
		}
		times.sort((a, b) => a - b);
		process.stdout.write(
			`[FE-15] 40KB cache hit (resanitize) min ${times[0].toFixed(1)}ms · median ${times[4].toFixed(1)}ms\n`
		);
		expect(times[0]).toBeLessThan(50);
	});
});
