import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RENDERER_VERSION } from './cache';

const root = new URL('../../../../', import.meta.url).pathname;

/**
 * L-4: RENDERER_VERSION ↔ 렌더러·sanitize 스키마 묶음 스냅샷.
 * render.ts·schema.ts가 바뀌면 이 지문이 달라진다. 그때는 cache.ts의 RENDERER_VERSION을 올리고
 * 아래 표에 `새 버전: 새 지문`을 추가한다(이전 캐시 값이 새 렌더러 결과로 쓰이지 않게).
 */
const SNAPSHOT: Record<string, string> = {
	'fe15-r4': '9dffc60b63362e60'
};

function rendererFingerprint(): string {
	const h = createHash('sha256');
	for (const f of ['render.ts', 'schema.ts', 'renderFields.ts']) {
		h.update(f + '\0' + readFileSync(join(root, 'src/lib/server/markdown', f), 'utf8') + '\0');
	}
	return h.digest('hex').slice(0, 16);
}

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) return sourceFiles(p);
		return /\.(ts|js|svelte)$/.test(p) && !/\.spec\.ts$/.test(p) ? [p] : [];
	});
}

describe('렌더러 버전·운영 경로 가드', () => {
	it('L-4: 렌더러·스키마가 바뀌면 RENDERER_VERSION을 올려야 한다', () => {
		expect(SNAPSHOT[RENDERER_VERSION], `RENDERER_VERSION=${RENDERER_VERSION}`).toBe(
			rendererFingerprint()
		);
	});
	it('조건 (c): 메모리 저장소는 운영 코드에서 쓰지 않는다(cache.ts 정의 외 사용 0건)', () => {
		const hits = sourceFiles(join(root, 'src'))
			.filter((p) => /\bcreateMemoryReportCache\b/.test(readFileSync(p, 'utf8')))
			.map((p) => relative(root, p));
		expect(hits).toEqual(['src/lib/server/markdown/cache.ts']);
	});
	it('본문 렌더(renderReport·renderReportCached)는 쓰기 시점 캐시·/dev/report만', () => {
		// FE-04: 읽기 경로에서 렌더 금지. BE-07: upsert_report 쓰기 시점만 cached-render에서 호출.
		const allowed = new Set([
			'src/lib/server/markdown/render.ts',
			'src/lib/server/markdown/cache.ts',
			'src/lib/server/mcp/tools/cached-render.ts',
			'src/routes/dev/report/+page.server.ts'
		]);
		const hits = sourceFiles(join(root, 'src'))
			.filter((p) =>
				/import\s*\{[^}]*\brenderReport(Cached)?\b[^}]*\}\s*from/.test(readFileSync(p, 'utf8'))
			)
			.map((p) => relative(root, p))
			.filter((p) => !allowed.has(p));
		expect(hits).toEqual([]);
	});
});
