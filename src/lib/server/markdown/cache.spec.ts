import { afterEach, describe, expect, it, vi } from 'vitest';
import { largeBriefing, sampleBriefing, sampleGlossary } from '$lib/fixtures/report';
import * as render from './render';
import {
	RENDERER_VERSION,
	createMemoryReportCache,
	renderReportCached,
	reportCacheKey,
	stripRenderFields,
	type CachedRender
} from './cache';

// sanitize 호출 횟수를 세기 위해 원래 구현을 감싼다(동작은 그대로)
const sanitizeCalls = vi.hoisted(() => ({ n: 0 }));
vi.mock('hast-util-sanitize', async (importOriginal) => {
	const mod = await importOriginal<typeof import('hast-util-sanitize')>();
	return {
		...mod,
		sanitize: (...args: Parameters<typeof mod.sanitize>) => {
			sanitizeCalls.n++;
			return mod.sanitize(...args);
		}
	};
});

afterEach(() => {
	vi.restoreAllMocks();
	sanitizeCalls.n = 0;
});

const report = { id: 'r-1', version: 3, body: sampleBriefing };
const opts = { glossary: sampleGlossary };

describe('리포트 렌더 캐시', () => {
	it('키에 id·version·RENDERER_VERSION(fe15-r3)이 들어간다', () => {
		expect(RENDERER_VERSION).toBe('fe15-r3');
		const key = reportCacheKey(report, opts);
		expect(key).toContain('r-1');
		expect(key).toContain(':v3:');
		expect(key).toContain(RENDERER_VERSION);
		expect(reportCacheKey(report, {})).not.toBe(key); // 옵션(용어 사전)이 다르면 다른 키
	});
	it('미스 → 마크다운 + sanitize 후 저장(키 포함)', async () => {
		const store = createMemoryReportCache();
		const spy = vi.spyOn(render, 'renderReport');
		const r = await renderReportCached(report, store, opts);
		expect(spy).toHaveBeenCalledTimes(1);
		expect(sanitizeCalls.n).toBeGreaterThan(0);
		const key = reportCacheKey(report, opts);
		const saved = store.map.get(key) as CachedRender;
		expect(saved.key).toBe(key);
		expect(saved.bodyBlocks.a).toBe(r.a);
		expect(saved.toc).toEqual(r.toc);
		expect(r).toEqual(render.renderReport(sampleBriefing, opts));
	});
	it('히트 → 재렌더·sanitize 없이 저장 값 그대로', async () => {
		const store = createMemoryReportCache();
		const first = await renderReportCached(report, store, opts);
		const rr = vi.spyOn(render, 'renderReport');
		sanitizeCalls.n = 0;
		const second = await renderReportCached(report, store, opts);
		expect(rr).not.toHaveBeenCalled();
		expect(sanitizeCalls.n).toBe(0);
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
	it('신뢰 모델: 키·형태·목차가 맞는 저장 값은 그대로 쓴다(변조 방어는 쓰기 경로)', async () => {
		const store = createMemoryReportCache();
		const key = reportCacheKey(report, opts);
		store.map.set(key, {
			key,
			bodyBlocks: { a: '<p>저장된 값</p>', b: '', hasSplit: false },
			toc: [{ id: 'h-a', text: 'A', level: 2, part: 'A' }]
		});
		const spy = vi.spyOn(render, 'renderReport');
		const r = await renderReportCached(report, store, opts);
		expect(spy).not.toHaveBeenCalled();
		expect(r.a).toBe('<p>저장된 값</p>');
		expect(r.toc).toEqual([{ id: 'h-a', text: 'A', level: 2, part: 'A' }]);
	});
	it.each<[string, unknown]>([
		['값 없음', undefined],
		['문자열', '<p>x</p>'],
		['bodyBlocks 누락', { key: 'K', toc: [] }],
		['a가 문자열 아님', { key: 'K', bodyBlocks: { a: 1, b: '', hasSplit: false }, toc: [] }],
		['hasSplit 누락', { key: 'K', bodyBlocks: { a: '', b: '' }, toc: [] }],
		['toc 배열 아님', { key: 'K', bodyBlocks: { a: '', b: '', hasSplit: false }, toc: {} }],
		[
			'toc id 형식 틀림',
			{
				key: 'K',
				bodyBlocks: { a: '', b: '', hasSplit: false },
				toc: [{ id: '"><script>', text: 'x', level: 2, part: 'A' }]
			}
		],
		[
			'toc 빈 글자',
			{
				key: 'K',
				bodyBlocks: { a: '', b: '', hasSplit: false },
				toc: [{ id: 'h-a', text: ' ', level: 2, part: 'A' }]
			}
		],
		[
			'toc level 틀림',
			{
				key: 'K',
				bodyBlocks: { a: '', b: '', hasSplit: false },
				toc: [{ id: 'h-a', text: 'a', level: 4, part: 'A' }]
			}
		],
		[
			'toc id 중복',
			{
				key: 'K',
				bodyBlocks: { a: '', b: '', hasSplit: false },
				toc: [
					{ id: 'h-a', text: 'a', level: 2, part: 'A' },
					{ id: 'h-a', text: 'b', level: 2, part: 'A' }
				]
			}
		],
		['키 불일치(이전 버전)', 'STALE_KEY'],
		['키 누락', 'NO_KEY']
	])('형태가 틀리면 미스로 보고 다시 렌더·저장: %s', async (_name, value) => {
		const store = createMemoryReportCache();
		const key = reportCacheKey(report, opts);
		const good = { bodyBlocks: { a: '<p>old</p>', b: '', hasSplit: false }, toc: [] };
		let v = value;
		if (value === 'STALE_KEY') v = { ...good, key: key.replace(RENDERER_VERSION, 'fe15-r2') };
		else if (value === 'NO_KEY') v = good;
		else if (typeof value === 'object' && value !== null && 'key' in value) v = { ...value, key };
		store.map.set(key, v);
		const spy = vi.spyOn(render, 'renderReport');
		const r = await renderReportCached(report, store, opts);
		expect(spy).toHaveBeenCalledTimes(1);
		expect(sanitizeCalls.n).toBeGreaterThan(0);
		expect(r.hasSplit).toBe(true);
		expect((store.map.get(key) as CachedRender).key).toBe(key);
		expect((store.map.get(key) as CachedRender).bodyBlocks.a).toBe(r.a);
	});
	it('상한 초과는 저장하지 않는다', async () => {
		const store = createMemoryReportCache();
		const r = await renderReportCached(
			{ id: 'big', version: 1, body: 'x'.repeat(render.MAX_REPORT_BYTES + 1) },
			store
		);
		expect(r.fallback).toBe('too-large');
		expect(store.map.size).toBe(0);
	});
	it('렌더 실패는 저장하지 않는다', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		const glossary = new Proxy(
			{},
			{
				ownKeys() {
					throw new Error('boom');
				}
			}
		) as Record<string, string>;
		const store = createMemoryReportCache();
		// 키 계산(옵션 지문)은 정상 사전으로 하고, 렌더만 던지는 사전으로 실패시킨다
		const real = render.renderReport;
		vi.spyOn(render, 'renderReport').mockImplementation((src) => real(src, { glossary }));
		const r = await renderReportCached(report, store, opts);
		expect(r.fallback).toBe('render-error');
		expect(err).toHaveBeenCalledTimes(1);
		expect(store.map.size).toBe(0);
	});
	it('쓰기 경로 계약: 외부 입력의 body_blocks·toc는 버린다', () => {
		const input = {
			id: 'r-1',
			body_md: '## a',
			body_blocks: { a: '<img src=x onerror=alert(1)>' },
			bodyBlocks: { a: '<script>' },
			toc: [{ id: 'x' }]
		};
		const out = stripRenderFields(input);
		expect(out).toEqual({ id: 'r-1', body_md: '## a' });
		const plain: string = '<p>';
		// @ts-expect-error — 일반 string은 CachedRender의 SanitizedHtml 자리에 넣을 수 없다
		const bad: CachedRender['bodyBlocks']['a'] = plain;
		expect(bad).toBe('<p>');
	});
	it('40KB 히트 비용 측정(재-sanitize 없음, DB처럼 JSON 문자열에서 읽기)', async () => {
		// 실제 저장소(jsonb)처럼 JSON 문자열로 보관하고 읽을 때 파싱한다
		const raw = new Map<string, string>();
		const store = {
			get: (key: string) => {
				const v = raw.get(key);
				return v === undefined ? undefined : JSON.parse(v);
			},
			set: (key: string, value: CachedRender) => {
				raw.set(key, JSON.stringify(value));
			}
		};
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
		const bytes = [...raw.values()][0].length;
		process.stdout.write(
			`[FE-15] 40KB cache hit (JSON ${bytes}B, no resanitize) min ${times[0].toFixed(2)}ms · median ${times[4].toFixed(2)}ms\n`
		);
		expect(times[0]).toBeLessThan(10);
	});
});
