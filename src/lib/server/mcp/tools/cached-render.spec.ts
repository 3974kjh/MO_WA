import { describe, expect, it, vi } from 'vitest';

const renderReport = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/markdown/render', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/markdown/render')>();
	renderReport.mockImplementation(actual.renderReport);
	return { ...actual, renderReport };
});

import {
	buildCachedRender,
	cachedRenderToColumns,
	MAX_RENDER_BODY_BYTES,
	RENDERER_VERSION,
	stripClientRenderCache
} from './cached-render';

describe('cached-render (BE-07 contract)', () => {
	it('renderer version is fe15-r2', () => {
		expect(RENDERER_VERSION).toBe('fe15-r2');
	});

	it('builds body blocks + toc with version stamped on both levels', () => {
		const r = buildCachedRender('## 요약\n\n본문 **강조**\n\n### 세부\n\n내용');
		expect(r).not.toBeNull();
		expect(r!.rendererVersion).toBe('fe15-r2');
		expect(r!.bodyBlocks.rendererVersion).toBe('fe15-r2');
		expect(r!.bodyBlocks.a).toContain('<strong>강조</strong>');
		expect(r!.bodyBlocks.hasSplit).toBe(false);
		expect(r!.toc.map((t) => t.text)).toEqual(['요약', '세부']);
		const cols = cachedRenderToColumns(r!);
		expect(cols.body_blocks).toEqual(r!.bodyBlocks);
		expect(cols.toc).toBe(r!.toc);
	});

	it('sanitizes raw html in the cached output', () => {
		const r = buildCachedRender('<script>alert(1)</script>\n\nhello');
		expect(r!.bodyBlocks.a).not.toContain('<script');
	});

	it('returns null when the renderer throws', () => {
		renderReport.mockImplementationOnce(() => {
			throw new Error('boom');
		});
		expect(buildCachedRender('# x')).toBeNull();
	});

	it('returns null for bodies over 1MB', () => {
		expect(buildCachedRender('a'.repeat(MAX_RENDER_BODY_BYTES + 1))).toBeNull();
	});

	it('stripClientRenderCache drops client cache fields only', () => {
		const out = stripClientRenderCache({
			title: 't',
			body_md: 'x',
			body_blocks: { a: '<p>evil</p>' },
			bodyBlocks: {},
			toc: []
		});
		expect(out).toEqual({ title: 't', body_md: 'x' });
	});
});
