import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SanitizedHtml 브랜드는 sanitize 직후(render.ts)와 검사된 캐시 히트(cacheRead.ts)에서만 만든다.
 * L-1(FE-15 리뷰): 정규식 한 줄 비교 대신 모든 import·export-from·동적 import 지정자를 실제 경로로 풀어 비교하고
 * (`./../brand.js`, `../markdown/brand.ts`, `$lib/server/markdown/brand.js` 등), 꺾쇠 캐스트 `<SanitizedHtml>x`도 막는다.
 */
const root = new URL('../../../../', import.meta.url).pathname;
const BRAND = join(root, 'src/lib/server/markdown/brand');

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) return sourceFiles(p);
		return /\.(ts|js|mjs|cjs|svelte)$/.test(p) && !/\.spec\.ts$/.test(p) ? [p] : [];
	});
}

const SPEC_RE = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"`])([^'"`]+)\1/g;

/** 지정자를 확장자 없는 절대 경로로. 패키지 이름이면 null */
function resolveSpecifier(file: string, spec: string): string | null {
	let p: string;
	if (spec.startsWith('$lib/')) p = join(root, 'src/lib', spec.slice(5));
	else if (spec.startsWith('.')) p = resolve(dirname(file), spec);
	else return null;
	return p.replace(/\/index$/, '').replace(/\.(ts|js|mjs|cjs)$/, '');
}

function importsBrand(file: string, src: string): boolean {
	for (const m of src.matchAll(SPEC_RE)) {
		if (resolveSpecifier(file, m[2]) === BRAND) return true;
	}
	return false;
}

/** `as SanitizedHtml`, `<SanitizedHtml>expr`(꺾쇠 캐스트). `Promise<SanitizedHtml>` 같은 타입 인자는 제외 */
function hasBrandCast(src: string): boolean {
	if (/\bas\s+SanitizedHtml\b/.test(src)) return true;
	const withoutTypeArgs = src.replace(/[\w$]\s*<\s*SanitizedHtml\s*>/g, '');
	return /<\s*SanitizedHtml\s*>/.test(withoutTypeArgs);
}

describe('SanitizedHtml 브랜드 생성 위치', () => {
	it('brand.ts는 render.ts·cacheRead.ts만 import한다(경로를 풀어서 비교)', () => {
		const hits = sourceFiles(join(root, 'src'))
			.filter((p) => importsBrand(p, readFileSync(p, 'utf8')))
			.map((p) => relative(root, p))
			.sort();
		expect(hits).toEqual([
			'src/lib/server/markdown/cacheRead.ts',
			'src/lib/server/markdown/render.ts'
		]);
	});
	it('src 어디에서도 SanitizedHtml 캐스트(as·꺾쇠)는 brand.ts에만 있다', () => {
		const hits = sourceFiles(join(root, 'src'))
			.filter((p) => hasBrandCast(readFileSync(p, 'utf8')))
			.map((p) => relative(root, p));
		expect(hits).toEqual(['src/lib/server/markdown/brand.ts']);
	});
	it('검사기 자체: 우회 형태를 잡는다', () => {
		const f = join(root, 'src/lib/server/repo/x.ts');
		const g = join(root, 'src/lib/server/markdown/sub/y.ts');
		expect(importsBrand(f, "import { asSanitized } from '../markdown/brand.js';")).toBe(true);
		expect(importsBrand(g, "import { asSanitized } from './../brand.js';")).toBe(true);
		expect(importsBrand(g, "export { asSanitized } from '../brand';")).toBe(true);
		expect(importsBrand(f, "const m = await import('$lib/server/markdown/brand.ts');")).toBe(true);
		expect(importsBrand(f, "import x from '$lib/components/brand/MoWaLogo.svelte';")).toBe(false);
		expect(importsBrand(f, "import { a } from './brandish';")).toBe(false);
		expect(hasBrandCast('const h = <SanitizedHtml>raw;')).toBe(true);
		expect(hasBrandCast('const h = (<SanitizedHtml>(raw));')).toBe(true);
		expect(hasBrandCast('const h = raw as unknown as SanitizedHtml;')).toBe(true);
		expect(hasBrandCast('let p: Promise<SanitizedHtml>; let a: Array< SanitizedHtml >;')).toBe(
			false
		);
	});
});
