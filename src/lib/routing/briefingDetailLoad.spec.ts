import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RENDERER_VERSION, reportCacheKey } from '$lib/server/markdown/cacheRead';

const repoMock = vi.hoisted(() => ({
	forUser: vi.fn((_sb: unknown, ownerId: string) => ({
		actor: { kind: 'user', ownerId, botClientId: null }
	})),
	getDailyBriefingMeta: vi.fn(async (_repo: unknown, date: string) => ({
		data:
			date === '2026-11-20'
				? {
						id: 'r1',
						title: '데일리 경제이슈 브리핑',
						headline: null,
						summary: null,
						report_date: date,
						tags: [],
						version: 3,
						generated_at: null,
						updated_at: '2026-11-20T08:36:00Z',
						sources: []
					}
				: null,
		error: null
	})),
	getReportRenderColumns: vi.fn()
}));
vi.mock('$lib/server/repo', () => repoMock);

// 운영 load는 렌더러를 부르면 안 된다. 불리면 테스트가 실패하도록 감싼다.
const renderSpy = vi.hoisted(() => ({
	renderReport: vi.fn(() => {
		throw new Error('renderReport must not be called from the briefing load');
	}),
	renderReportCached: vi.fn(() => {
		throw new Error('renderReportCached must not be called from the briefing load');
	})
}));
vi.mock('$lib/server/markdown/render', async (orig) => ({
	...(await orig<object>()),
	renderReport: renderSpy.renderReport
}));
vi.mock('$lib/server/markdown/cache', async (orig) => ({
	...(await orig<object>()),
	renderReportCached: renderSpy.renderReportCached
}));

import { load } from '../../routes/(app)/briefings/[date]/+page.server';

const locals = { user: { id: 'u1' }, supabase: {} };
// load 이벤트 중 locals·params·url만 쓰므로 최소 모양만 넘긴다.
const call = (date: string, search = '') =>
	(load as unknown as (e: unknown) => Promise<Record<string, unknown>>)({
		locals,
		params: { date },
		url: new URL(`http://x/briefings/${date}${search}`)
	});
const detail = () => call('2026-11-20', '?mode=detail');

/** 쓰기 경로(cachedRenderToDbColumns)와 같은 모양의 저장 값 */
function stored(
	over: { key?: string; version?: number; bodyBlocks?: unknown; toc?: unknown } = {}
) {
	return {
		version: over.version ?? 3,
		body_blocks: {
			key: over.key ?? reportCacheKey({ id: 'r1', version: 3 }),
			bodyBlocks: over.bodyBlocks ?? {
				a: '<h2 id="h-요약">요약</h2><p>A</p>',
				b: '<h2 id="h-근거">근거</h2><p>B</p>',
				hasSplit: true
			}
		},
		toc: over.toc ?? [
			{ id: 'h-요약', text: '요약', level: 2, part: 'A' },
			{ id: 'h-근거', text: '근거', level: 2, part: 'B' }
		]
	};
}
const rowOk = (data: unknown) =>
	repoMock.getReportRenderColumns.mockResolvedValueOnce({ data, error: null });

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('FE-04 브리핑 상세 load', () => {
	it('mode 기본은 summary, ?mode=detail은 detail, 허용 밖 값은 summary', async () => {
		repoMock.getReportRenderColumns.mockResolvedValue({ data: null, error: null });
		expect((await call('2026-11-20')).mode).toBe('summary');
		expect((await call('2026-11-20', '?mode=detail')).mode).toBe('detail');
		expect((await call('2026-11-20', '?mode=x')).mode).toBe('summary');
	});
	it('요약 모드는 메타만 돌려주고 렌더 캐시를 읽지 않는다', async () => {
		const out = await call('2026-11-20');
		const b = out.briefing as Record<string, unknown>;
		expect(b.id).toBe('r1');
		for (const k of ['body_md', 'body_blocks', 'toc', 'a', 'b']) expect(b).not.toHaveProperty(k);
		expect(out).not.toHaveProperty('report');
		expect(out.body).toBeNull();
		expect(repoMock.getReportRenderColumns).not.toHaveBeenCalled();
	});
	it('날짜 형식이 틀리면 DB를 부르지 않고 404', async () => {
		await expect(call('2026-02-30')).rejects.toMatchObject({ status: 404 });
		await expect(call('latest')).rejects.toMatchObject({ status: 404 });
		expect(repoMock.getDailyBriefingMeta).not.toHaveBeenCalled();
	});
	it('없는 날짜는 404', async () => {
		await expect(call('2026-11-21')).rejects.toMatchObject({ status: 404 });
	});
});

describe('FE-04 상세 본문: 저장된 렌더 캐시만 읽기', () => {
	it('키·형태·목차가 모두 맞으면 저장 HTML을 그대로 붙인다', async () => {
		rowOk(stored());
		const out = await detail();
		expect(repoMock.getReportRenderColumns).toHaveBeenCalledWith(expect.anything(), 'r1');
		expect(out.body).toEqual({
			a: '<h2 id="h-요약">요약</h2><p>A</p>',
			b: '<h2 id="h-근거">근거</h2><p>B</p>',
			hasSplit: true,
			toc: [
				{ id: 'h-요약', text: '요약', level: 2, part: 'A' },
				{ id: 'h-근거', text: '근거', level: 2, part: 'B' }
			]
		});
	});
	it('reports.version 불일치(저장 키의 버전이 옛 값) → 준비 중', async () => {
		rowOk(stored({ key: reportCacheKey({ id: 'r1', version: 2 }) }));
		expect((await detail()).body).toBeNull();
	});
	it('메타 이후 행 version이 바뀌면 → 준비 중', async () => {
		rowOk(stored({ version: 4, key: reportCacheKey({ id: 'r1', version: 4 }) }));
		expect((await detail()).body).toBeNull();
	});
	it('다른 리포트 id의 키 → 준비 중', async () => {
		rowOk(stored({ key: reportCacheKey({ id: 'r2', version: 3 }) }));
		expect((await detail()).body).toBeNull();
	});
	it('RENDERER_VERSION 불일치 → 준비 중', async () => {
		const key = reportCacheKey({ id: 'r1', version: 3 }).replace(RENDERER_VERSION, 'fe15-r3');
		expect(key).not.toBe(reportCacheKey({ id: 'r1', version: 3 }));
		rowOk(stored({ key }));
		expect((await detail()).body).toBeNull();
	});
	it('옵션 지문 불일치(용어 사전으로 만든 키) → 준비 중', async () => {
		rowOk(stored({ key: reportCacheKey({ id: 'r1', version: 3 }, { glossary: { PER: 'x' } }) }));
		expect((await detail()).body).toBeNull();
	});
	it.each([
		['body_blocks null', { body_blocks: null }],
		['body_blocks 배열', { body_blocks: [] }],
		['bodyBlocks 없음', { body_blocks: { key: reportCacheKey({ id: 'r1', version: 3 }) } }]
	])('형태 오류(%s) → 준비 중', async (_n, patch) => {
		rowOk({ ...stored(), ...patch });
		expect((await detail()).body).toBeNull();
	});
	it.each([
		['a가 문자열 아님', { a: 1, b: '', hasSplit: false }],
		['hasSplit 누락', { a: '<p>A</p>', b: '' }],
		['구분 없음인데 B가 있음', { a: '<p>A</p>', b: '<p>B</p>', hasSplit: false }]
	])('bodyBlocks 형태 오류(%s) → 준비 중', async (_n, bodyBlocks) => {
		rowOk(stored({ bodyBlocks, toc: [] }));
		expect((await detail()).body).toBeNull();
	});
	it.each([
		['배열 아님', { x: 1 }],
		['id 형식', [{ id: 'bad id', text: '요약', level: 2, part: 'A' }]],
		['level 4', [{ id: 'h-요약', text: '요약', level: 4, part: 'A' }]],
		['part 값', [{ id: 'h-요약', text: '요약', level: 2, part: 'C' }]],
		['빈 제목', [{ id: 'h-요약', text: '  ', level: 2, part: 'A' }]],
		[
			'중복 id',
			[
				{ id: 'h-요약', text: '요약', level: 2, part: 'A' },
				{ id: 'h-요약', text: '요약', level: 3, part: 'A' }
			]
		],
		['본문에 없는 앵커', [{ id: 'h-없음', text: '없음', level: 2, part: 'A' }]],
		['영역이 다른 앵커', [{ id: 'h-근거', text: '근거', level: 2, part: 'A' }]]
	])('목차 오류(%s) → 준비 중', async (_n, toc) => {
		rowOk(stored({ toc }));
		expect((await detail()).body).toBeNull();
	});
	it('행 없음 → 준비 중', async () => {
		rowOk(null);
		expect((await detail()).body).toBeNull();
	});
	it('DB 오류 → 준비 중, 원문은 서버 로그에만(페이지 데이터에 없음)', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const raw = 'permission denied for table reports SECRET-DETAIL';
		repoMock.getReportRenderColumns.mockResolvedValueOnce({
			data: null,
			error: Object.assign(new Error(raw), { code: '42501' })
		});
		const out = await detail();
		expect(out.body).toBeNull();
		expect(JSON.stringify(out)).not.toContain('SECRET-DETAIL');
		expect(log).toHaveBeenCalledWith('[briefing-detail] render cache read failed', {
			code: '42501',
			message: raw
		});
	});
	it('저장소 호출이 예외를 던져도 → 준비 중(500 아님)', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		repoMock.getReportRenderColumns.mockRejectedValueOnce(new Error('fetch failed'));
		expect((await detail()).body).toBeNull();
		expect(log).toHaveBeenCalledOnce();
	});
	it('어떤 경우에도 renderReport·renderReportCached를 부르지 않는다', async () => {
		rowOk(stored());
		await detail();
		rowOk(stored({ key: 'x' }));
		await detail();
		rowOk(null);
		await detail();
		expect(renderSpy.renderReport).not.toHaveBeenCalled();
		expect(renderSpy.renderReportCached).not.toHaveBeenCalled();
	});
});

/**
 * 정적 검사: load 모듈의 import 그래프(type-only import 제외)에 render.ts·cache.ts가 없다.
 * repo는 실제 파일까지 따라간다($lib 별칭·상대 경로만, 패키지는 건너뜀).
 */
describe('FE-04 상세 load import 그래프', () => {
	const root = new URL('../../../', import.meta.url).pathname;
	const SPEC_RE =
		/(?:^|[;\n])\s*(?:import|export)\s+(?!type\b)(?:[^'"`;]*?\sfrom\s*)?(['"`])([^'"`]+)\1|\bimport\s*\(\s*(['"`])([^'"`]+)\3/g;

	function resolveFile(from: string, spec: string): string | null {
		let p: string;
		if (spec.startsWith('$lib/')) p = join(root, 'src/lib', spec.slice(5));
		else if (spec.startsWith('.')) p = resolve(dirname(from), spec);
		else return null;
		p = p.replace(/\.js$/, '');
		for (const c of [p, `${p}.ts`, join(p, 'index.ts')]) {
			try {
				readFileSync(c);
				return c;
			} catch {
				/* 다음 후보 */
			}
		}
		return null;
	}

	function graph(entry: string): Set<string> {
		const seen = new Set<string>();
		const stack = [entry];
		while (stack.length) {
			const f = stack.pop() as string;
			if (seen.has(f)) continue;
			seen.add(f);
			const src = readFileSync(f, 'utf8');
			for (const m of src.matchAll(SPEC_RE)) {
				const r = resolveFile(f, m[2] ?? m[4]);
				if (r) stack.push(r);
			}
		}
		return seen;
	}

	it('render.ts·cache.ts에 닿지 않고, cacheRead.ts·briefingBody.ts는 지난다', () => {
		const files = [...graph(join(root, 'src/routes/(app)/briefings/[date]/+page.server.ts'))].map(
			(f) => f.slice(root.length)
		);
		expect(files).toContain('src/lib/server/web/briefingBody.ts');
		expect(files).toContain('src/lib/server/markdown/cacheRead.ts');
		expect(files).toContain('src/lib/server/repo/webLoads.repo.ts');
		expect(files).not.toContain('src/lib/server/markdown/render.ts');
		expect(files).not.toContain('src/lib/server/markdown/cache.ts');
		expect(files).not.toContain('src/lib/server/mcp/tools/cached-render.ts');
	});
	it('load·본문 모듈 소스에 renderReport 문자열이 없다', () => {
		for (const f of [
			'src/routes/(app)/briefings/[date]/+page.server.ts',
			'src/lib/server/web/briefingBody.ts',
			'src/lib/server/markdown/cacheRead.ts'
		]) {
			expect(readFileSync(join(root, f), 'utf8'), f).not.toMatch(/renderReport/);
		}
	});
});
