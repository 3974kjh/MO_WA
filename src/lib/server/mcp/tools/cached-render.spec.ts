import { describe, expect, it, vi } from 'vitest';
import { RENDERER_VERSION as FE_VERSION } from '$lib/server/markdown/cache';
import {
	buildWriteTimeCachedRender,
	cachedRenderToDbColumns,
	clearedRenderColumns,
	RENDERER_VERSION,
	stripClientRenderCache,
	stripRenderFields
} from './cached-render';

vi.mock('$lib/server/markdown/render', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/markdown/render')>();
	return {
		...actual,
		renderReport: (src: string, opts?: Parameters<typeof actual.renderReport>[1]) => {
			if (src === '__THROW__') throw new Error('boom');
			return actual.renderReport(src, opts);
		}
	};
});

describe('BE-07 CachedRender write-time (fe15-r3)', () => {
	it('RENDERER_VERSION is fe15-r3 and matches FE cache module', () => {
		expect(RENDERER_VERSION).toBe('fe15-r3');
		expect(RENDERER_VERSION).toBe(FE_VERSION);
	});

	it('buildWriteTimeCachedRender writes CachedRender shape with key', () => {
		const r = buildWriteTimeCachedRender({
			id: '11111111-1111-4111-8111-111111111111',
			version: 1,
			body_md: '# A. 요약\n\n본문\n\n# B. 상세 근거\n\n세부'
		});
		expect(r).not.toBeNull();
		expect(r!.key).toContain('fe15-r3');
		expect(r!.key).toContain('11111111-1111-4111-8111-111111111111');
		expect(typeof r!.bodyBlocks.a).toBe('string');
		expect(typeof r!.bodyBlocks.hasSplit).toBe('boolean');
		expect(Array.isArray(r!.toc)).toBe(true);
	});

	it('stripRenderFields / stripClientRenderCache drops client body_blocks/toc/bodyBlocks', () => {
		const input = {
			title: 't',
			body_md: 'x',
			body_blocks: { a: '<script>' },
			bodyBlocks: { a: 'evil' },
			toc: [{ id: 'x' }]
		};
		const out = stripRenderFields(input);
		expect(out).toEqual({ title: 't', body_md: 'x' });
		expect(stripClientRenderCache(input)).toEqual({ title: 't', body_md: 'x' });
	});

	it('fallback too-large is not cached', () => {
		const huge = '가'.repeat(600_000);
		expect(
			buildWriteTimeCachedRender({
				id: '22222222-2222-4222-8222-222222222222',
				version: 1,
				body_md: huge
			})
		).toBeNull();
	});

	it('render throw is not cached', () => {
		expect(
			buildWriteTimeCachedRender({
				id: '33333333-3333-4333-8333-333333333333',
				version: 1,
				body_md: '__THROW__'
			})
		).toBeNull();
	});

	it('cachedRenderToDbColumns + clearedRenderColumns', () => {
		const r = buildWriteTimeCachedRender({
			id: '44444444-4444-4444-8444-444444444444',
			version: 2,
			body_md: '## 제목\n\n본문 투자 권유 아님'
		});
		expect(r).not.toBeNull();
		const cols = cachedRenderToDbColumns(r!);
		expect(cols.body_blocks.key).toBe(r!.key);
		expect(cols.body_blocks.bodyBlocks.hasSplit).toBe(r!.bodyBlocks.hasSplit);
		expect(cols.toc).toEqual(r!.toc);
		expect(clearedRenderColumns()).toEqual({ body_blocks: null, toc: [] });
	});
});
