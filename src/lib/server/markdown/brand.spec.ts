import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** SanitizedHtml 브랜드는 sanitize 직후(render.ts)와 검사된 캐시 히트(cache.ts)에서만 만든다 */
const root = new URL('../../../../', import.meta.url).pathname;

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) return sourceFiles(p);
		return /\.(ts|js|svelte)$/.test(p) && !/\.spec\.ts$/.test(p) ? [p] : [];
	});
}

describe('SanitizedHtml 브랜드 생성 위치', () => {
	it('brand.ts는 render.ts·cache.ts만 import한다', () => {
		const hits = sourceFiles(join(root, 'src'))
			.filter((p) =>
				/from\s+['"](\.\/brand|\$lib\/server\/markdown\/brand)['"]/.test(readFileSync(p, 'utf8'))
			)
			.map((p) => relative(root, p))
			.sort();
		expect(hits).toEqual(['src/lib/server/markdown/cache.ts', 'src/lib/server/markdown/render.ts']);
	});
	it('src 어디에서도 `as SanitizedHtml` 캐스트는 brand.ts에만 있다', () => {
		const hits = sourceFiles(join(root, 'src'))
			.filter((p) => /as\s+SanitizedHtml\b/.test(readFileSync(p, 'utf8')))
			.map((p) => relative(root, p));
		expect(hits).toEqual(['src/lib/server/markdown/brand.ts']);
	});
});
