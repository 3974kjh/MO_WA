/**
 * BE-07 write-time render cache — aligns with FE-15 hardening (`fe15-r3`).
 *
 * Uses the shared FE module (`$lib/server/markdown/cache.ts`):
 * - RENDERER_VERSION / stripRenderFields / CachedRender / reportCacheKey
 * - fallback (`too-large` | `render-error`) is never cached
 * - memory store is NOT used in production; DB columns are written only via
 *   `mowa_set_report_render_cache` (column GRANTs revoked from bots/authenticated)
 */
import {
	RENDERER_VERSION,
	reportCacheKey,
	stripRenderFields,
	type CachedRender
} from '$lib/server/markdown/cache';
import { renderReport } from '$lib/server/markdown/render';

export { RENDERER_VERSION, stripRenderFields, reportCacheKey };
export type { CachedRender };

/** @deprecated use stripRenderFields — kept as alias for older call sites/tests */
export const stripClientRenderCache = stripRenderFields;

/**
 * Render body_md for DB cache after the report row exists (id + version known).
 * Returns null when the renderer falls back (too-large / render-error) or throws —
 * caller must omit/clear cache columns and still keep the validated body_md save.
 */
export function buildWriteTimeCachedRender(report: {
	id: string;
	version: number | string;
	body_md: string;
}): CachedRender | null {
	if (typeof report.body_md !== 'string') return null;
	try {
		const rendered = renderReport(report.body_md);
		if (rendered.fallback) return null;
		const key = reportCacheKey({ id: report.id, version: report.version });
		return {
			key,
			bodyBlocks: {
				a: rendered.a,
				b: rendered.b,
				hasSplit: rendered.hasSplit
			},
			toc: rendered.toc
		};
	} catch {
		return null;
	}
}

/** Split CachedRender across reports.body_blocks + reports.toc columns. */
export function cachedRenderToDbColumns(cache: CachedRender): {
	body_blocks: {
		key: string;
		bodyBlocks: CachedRender['bodyBlocks'];
	};
	toc: CachedRender['toc'];
} {
	return {
		body_blocks: {
			key: cache.key,
			bodyBlocks: cache.bodyBlocks
		},
		toc: cache.toc
	};
}

/** Clear stale cache when body_md saved but render fell back / failed. */
export function clearedRenderColumns(): { body_blocks: null; toc: [] } {
	return { body_blocks: null, toc: [] };
}
