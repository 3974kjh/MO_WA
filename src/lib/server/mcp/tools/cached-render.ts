/**
 * Write-time render cache contract (BE-07). Matches FE hardening `fe15-r2`:
 * `reports.body_blocks` holds the sanitized A/B HTML + renderer version, `reports.toc`
 * holds the TOC array. Readers must ignore (and re-render) when rendererVersion differs.
 */
import { renderReport } from '$lib/server/markdown/render';
import type { TocItem } from '$lib/markdown/types';

export const RENDERER_VERSION = 'fe15-r2' as const;

export const MAX_RENDER_BODY_BYTES = 1_048_576;

export type CachedBodyBlocks = {
	a: string;
	b: string;
	hasSplit: boolean;
	rendererVersion: typeof RENDERER_VERSION;
};

export type CachedRender = {
	bodyBlocks: CachedBodyBlocks;
	toc: TocItem[];
	rendererVersion: typeof RENDERER_VERSION;
};

/** Render markdown for the DB cache. Null (do not cache) on oversize input or renderer failure. */
export function buildCachedRender(bodyMd: string): CachedRender | null {
	if (typeof bodyMd !== 'string') return null;
	if (new TextEncoder().encode(bodyMd).byteLength > MAX_RENDER_BODY_BYTES) return null;
	try {
		const rendered = renderReport(bodyMd);
		return {
			bodyBlocks: {
				a: rendered.a,
				b: rendered.b,
				hasSplit: rendered.hasSplit,
				rendererVersion: RENDERER_VERSION
			},
			toc: rendered.toc,
			rendererVersion: RENDERER_VERSION
		};
	} catch {
		return null;
	}
}

/** Columns to write for a cache hit: `{ body_blocks, toc }`. */
export function cachedRenderToColumns(render: CachedRender): {
	body_blocks: CachedBodyBlocks;
	toc: TocItem[];
} {
	return { body_blocks: render.bodyBlocks, toc: render.toc };
}

/** Columns that clear a stale cache (body changed but render failed / oversized). */
export function clearedRenderColumns(): { body_blocks: null; toc: [] } {
	return { body_blocks: null, toc: [] };
}

const CLIENT_CACHE_KEYS = ['body_blocks', 'bodyBlocks', 'toc'] as const;

/** Clients must never write the render cache — drop those keys from tool args. */
export function stripClientRenderCache<T extends Record<string, unknown>>(
	args: T
): Omit<T, 'body_blocks' | 'bodyBlocks' | 'toc'> {
	const out: Record<string, unknown> = { ...args };
	for (const key of CLIENT_CACHE_KEYS) delete out[key];
	return out as Omit<T, 'body_blocks' | 'bodyBlocks' | 'toc'>;
}
