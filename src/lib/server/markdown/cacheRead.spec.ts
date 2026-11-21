import { describe, expect, it } from 'vitest';
import { largeBriefing, sampleBriefing } from '$lib/fixtures/report';
import {
	buildWriteTimeCachedRender,
	cachedRenderToDbColumns
} from '$lib/server/mcp/tools/cached-render';
import { renderReport } from './render';
import { RENDERER_VERSION, readStoredRender, reportCacheKey } from './cacheRead';
import * as cache from './cache';

/** 쓰기 경로(BE-07 cached-render) ↔ 읽기 경로(FE-04 readStoredRender) 계약 */
describe('readStoredRender: 쓰기 시점 렌더 값과의 계약', () => {
	it.each([
		['sample', sampleBriefing],
		['large', largeBriefing()],
		['구분 없음', '## 제목\n\n본문 문단']
	])('쓰기 경로가 만든 컬럼(%s)은 그대로 히트하고 렌더 결과와 같다', (_n, body) => {
		const report = { id: '7f1c2e0a-0000-4000-8000-000000000001', version: 5 };
		const cached = buildWriteTimeCachedRender({ ...report, body_md: body });
		expect(cached).not.toBeNull();
		const cols = cachedRenderToDbColumns(cached!);
		// PostgREST jsonb 왕복을 흉내 낸다
		const roundTrip = JSON.parse(JSON.stringify(cols));
		const out = readStoredRender(roundTrip, report);
		const fresh = renderReport(body);
		expect(out).toEqual({ a: fresh.a, b: fresh.b, hasSplit: fresh.hasSplit, toc: fresh.toc });
	});
	it('id·version이 다르면 미스', () => {
		const report = { id: 'r1', version: 2 };
		const cols = cachedRenderToDbColumns(
			buildWriteTimeCachedRender({ ...report, body_md: sampleBriefing })!
		);
		expect(readStoredRender(cols, { id: 'r1', version: 3 })).toBeNull();
		expect(readStoredRender(cols, { id: 'r2', version: 2 })).toBeNull();
	});
	it('잘못된 id·version은 예외 없이 미스', () => {
		const cols = { body_blocks: { key: 'x', bodyBlocks: {} }, toc: [] };
		expect(readStoredRender(cols, { id: '', version: 1 })).toBeNull();
		expect(readStoredRender(cols, { id: 'r1', version: -1 })).toBeNull();
		expect(readStoredRender(cols, { id: 'r1', version: 1.5 })).toBeNull();
	});
	it('cache.ts는 cacheRead.ts의 키·버전을 그대로 다시 내보낸다', () => {
		expect(cache.RENDERER_VERSION).toBe(RENDERER_VERSION);
		expect(cache.reportCacheKey).toBe(reportCacheKey);
	});
});
