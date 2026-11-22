import { describe, expect, it } from 'vitest';
import { largeBriefing, sampleBriefing } from '$lib/fixtures/report';
import {
	buildWriteTimeCachedRender,
	cachedRenderToDbColumns
} from '$lib/server/mcp/tools/cached-render';
import { renderReport } from './render';
import { RENDERER_VERSION, readCachedRender, readStoredRender, reportCacheKey } from './cacheRead';
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

/** FE-04 Low-2·Nit-1: 목차 앵커 검사는 `\sid="…"` 속성만 센다(HTML을 한 번 훑어 Set으로 확인). */
describe('readCachedRender: 목차 앵커 id 속성 검사', () => {
	const key = reportCacheKey({ id: 'r1', version: 1 });
	const item = (id: string, part: 'A' | 'B' = 'A') => ({ id, text: '제목', level: 2, part });
	const read = (a: string, toc: unknown[], b = '', hasSplit = b !== '') =>
		readCachedRender({ key, bodyBlocks: { a, b, hasSplit }, toc }, key);

	it('실제 id 속성은 히트: 태그 첫 속성·다른 속성 뒤·줄바꿈 뒤, A·B 영역 각각', () => {
		const a = '<h2 id="h-one">1</h2><h3 class="x" id="h-two">2</h3><h2\n id="h-three">3</h2>';
		const b = '<h2 id="h-bee">B</h2>';
		const toc = [item('h-one'), item('h-two'), item('h-three'), item('h-bee', 'B')];
		const out = read(a, toc, b);
		expect(out).not.toBeNull();
		expect(out!.toc.map((t) => t.id)).toEqual(['h-one', 'h-two', 'h-three', 'h-bee']);
	});

	it('목차가 비어 있으면 HTML과 상관없이 히트(회귀)', () => {
		expect(read('<p>본문</p>', [])).not.toBeNull();
	});

	it('data-id="…"·xid="…" 같은 부분 문자열은 앵커가 아니다(미스)', () => {
		expect(read('<h2 data-id="h-foo">x</h2>', [item('h-foo')])).toBeNull();
		expect(read('<h2 xid="h-foo">x</h2>', [item('h-foo')])).toBeNull();
		expect(read('<h2 aria-id="h-foo">x</h2>', [item('h-foo')])).toBeNull();
		// 진짜 id가 함께 있으면 히트
		expect(read('<h2 data-id="h-foo" id="h-foo">x</h2>', [item('h-foo')])).not.toBeNull();
	});

	it('다른 영역의 id는 세지 않는다(A 목차 id가 B에만 있으면 미스)', () => {
		expect(read('<p>a</p>', [item('h-bee')], '<h2 id="h-bee">B</h2>')).toBeNull();
		expect(read('<h2 id="h-a">A</h2>', [item('h-a', 'B')], '<p>b</p>')).toBeNull();
	});

	it('id 값은 정확히 일치해야 한다(접두·접미만 같으면 미스)', () => {
		expect(read('<h2 id="h-foobar">x</h2>', [item('h-foo')])).toBeNull();
		expect(read('<h2 id="h-fo">x</h2>', [item('h-foo')])).toBeNull();
	});

	it('RENDERER_VERSION은 바뀌지 않았다(히트 규칙은 강화만)', () => {
		expect(RENDERER_VERSION).toBe('fe15-r4');
	});
});
