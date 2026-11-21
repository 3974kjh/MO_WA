import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromHtml } from 'hast-util-from-html';
import { visit } from 'unist-util-visit';
import {
	MAX_REPORT_BYTES,
	RENDER_ERROR_MESSAGE,
	SLUG_MAX,
	TOO_LARGE_MESSAGE,
	renderReport,
	sanitizeFragment,
	slugify
} from './render';

afterEach(() => vi.restoreAllMocks());

function imgSrcs(html: string): string[] {
	const out: string[] = [];
	visit(fromHtml(html, { fragment: true }), 'element', (n) => {
		if (n.tagName === 'img') out.push(String(n.properties.src));
	});
	return out;
}

describe('Low-1 입력 길이 상한', () => {
	it('상한은 200KB(UTF-8 바이트)', () => {
		expect(MAX_REPORT_BYTES).toBe(200 * 1024);
	});
	it('1MB 입력은 파서를 돌리지 않고 바로 고정 문구', () => {
		const src = '## 제목\n\n' + '가나다 <script>x</script> '.repeat(40_000);
		expect(new TextEncoder().encode(src).length).toBeGreaterThan(1024 * 1024);
		const t0 = performance.now();
		const r = renderReport(src);
		const ms = performance.now() - t0;
		expect(ms).toBeLessThan(20);
		expect(r.fallback).toBe('too-large');
		expect(r.a).toBe(`<p>${TOO_LARGE_MESSAGE}</p>`);
		expect(r.b).toBe('');
		expect(r.toc).toEqual([]);
		expect(r.a).not.toContain('가나다');
	});
	it('바이트 기준: 글자 수는 상한 안이어도 한글 3바이트로 넘으면 대체', () => {
		const src = '가'.repeat(Math.floor(MAX_REPORT_BYTES / 3) + 10);
		expect(src.length).toBeLessThan(MAX_REPORT_BYTES);
		expect(renderReport(src).fallback).toBe('too-large');
	});
	it('상한 바로 아래는 정상 렌더', () => {
		const src = 'a'.repeat(MAX_REPORT_BYTES);
		const r = renderReport(src);
		expect(r.fallback).toBeUndefined();
		expect(r.a.startsWith('<p>aaa')).toBe(true);
	});
});

describe('Low-2 slug 충돌·길이·제어 문자', () => {
	it('a, a, "a 2" → 모두 다른 id', () => {
		const used = new Set<string>();
		expect(['a', 'a', 'a 2'].map((t) => slugify(t, used))).toEqual(['h-a', 'h-a-2', 'h-a-2-2']);
	});
	it('"a 2"가 먼저 나와도 겹치지 않는다', () => {
		const used = new Set<string>();
		expect(['a 2', 'a', 'a'].map((t) => slugify(t, used))).toEqual(['h-a-2', 'h-a', 'h-a-3']);
	});
	it('렌더 결과: id가 유일하고 목차와 일치', () => {
		const r = renderReport('## a\n\n## a\n\n## a 2\n\n### a-2\n\n## !!!\n\n## ???');
		const ids = r.toc.map((t) => t.id);
		expect(ids).toEqual(['h-a', 'h-a-2', 'h-a-2-2', 'h-a-2-3', 'h-section', 'h-section-2']);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(r.a.match(new RegExp(`id="${id}"`, 'g'))?.length).toBe(1);
	});
	it(`slug 본문은 ${SLUG_MAX}자까지`, () => {
		const id = slugify('가'.repeat(300), new Set());
		expect(id).toBe('h-' + '가'.repeat(SLUG_MAX));
		const id2 = slugify('a'.repeat(SLUG_MAX - 1) + ' b', new Set());
		expect(id2.endsWith('-')).toBe(false);
	});
	it('RTL·폭 없는 제어 문자는 slug와 목차 글자에서 빠진다', () => {
		const r = renderReport('## 삼성\u202E전자\u200B 실적');
		expect(r.toc[0].id).toBe('h-삼성전자-실적');
		expect(r.toc[0].text).toBe('삼성전자 실적');
	});
	it('빈 제목은 목차에 넣지 않는다', () => {
		const r = renderReport('## \u3000\n\n## 내용\n\n## \u200B');
		expect(r.toc.map((t) => t.text)).toEqual(['내용']);
	});
});

describe('Low-3 같은 출처 이미지 경로(허용 목록 /img·/report-assets)', () => {
	const denied = [
		'/api/mcp',
		'/api/mcp?x=1',
		'/API/mcp',
		'/%61pi/mcp',
		'/img/../api/mcp',
		'/report-assets/../api/mcp',
		'/img/%2e%2e/api/mcp',
		'/img/%2E%2E/api',
		'/img/.%2e/api',
		'/./img/a.png',
		'/img/./a.png',
		'/logout',
		'/login',
		'/imgx/a.png',
		'/IMG/a.png',
		'/img;x/a.png',
		'/report-assets-x/a.png',
		'/a.png',
		'/img%2f..%2fapi',
		'/img/a b.png'
	];
	it.each(denied)('마크다운 이미지 %s 는 제거', (src) => {
		expect(imgSrcs(renderReport(`![a](<${src}>)`).a)).toEqual([]);
	});
	it.each(denied)('raw img %s 도 제거(2차 방어선)', (src) => {
		expect(imgSrcs(sanitizeFragment(`<img src="${src}">`))).toEqual([]);
	});
	it.each(['/img', '/img/a.png', '/report-assets', '/report-assets/2026/a.png?v=1'])(
		'허용 경로 %s 는 남는다',
		(src) => {
			expect(imgSrcs(sanitizeFragment(`<img src="${src}">`))).toEqual([src]);
			expect(imgSrcs(renderReport(`![a](${src})`).a)).toEqual([src]);
		}
	);
	it('한글 파일명(퍼센트 인코딩)도 허용 경로 안이면 남는다', () => {
		expect(imgSrcs(renderReport('![b](/report-assets/2026/차트.png)').a)).toEqual([
			'/report-assets/2026/%EC%B0%A8%ED%8A%B8.png'
		]);
	});
});

describe('Low-5 sanitizeFragment 같은 출처 판정 우회', () => {
	const tricky = [
		'/\t/evil.example',
		'/\n/evil.example',
		'\\\\evil.example',
		'\\/evil.example',
		'/\\evil.example',
		'  //evil.example',
		'\u0001//evil.example',
		'\t//evil.example/x'
	];
	it.each(tricky)('링크 %j 는 외부로 판정해 새 창 + rel', (href) => {
		const out = sanitizeFragment(`<a href="${href}">x</a>`);
		// 남는다면 반드시 외부 링크 취급이어야 한다
		if (out.includes('<a ')) {
			expect(out).toContain('target="_blank"');
			expect(out).toContain('rel="noopener noreferrer nofollow"');
		} else {
			expect(out).toBe('x');
		}
	});
	it.each(tricky)('이미지 %j 는 제거', (src) => {
		expect(imgSrcs(sanitizeFragment(`<img src="${src}">`))).toEqual([]);
	});
	it('외부 이미지도 허용 호스트에 대해 같은 해석을 쓴다', () => {
		expect(
			imgSrcs(
				sanitizeFragment('<img src="https://cdn.example.com\\@evil.example/a.png">', {
					imageHosts: ['cdn.example.com']
				})
			)
		).toEqual([]);
		expect(
			imgSrcs(
				sanitizeFragment('<img src="https://cdn.example.com/a.png">', {
					imageHosts: ['cdn.example.com']
				})
			)
		).toEqual(['https://cdn.example.com/a.png']);
	});
	it('정상 상대 링크·앵커·mailto는 새 창 없이 그대로', () => {
		expect(sanitizeFragment('<a href="/briefings/1">a</a>')).toBe('<a href="/briefings/1">a</a>');
		expect(sanitizeFragment('<a href="#h-a">a</a>')).toBe('<a href="#h-a">a</a>');
		expect(sanitizeFragment('<a href="mailto:me@example.com">a</a>')).toBe(
			'<a href="mailto:me@example.com">a</a>'
		);
	});
});

describe('Low-6 렌더 실패 대체', () => {
	it('예외가 나면 고정 문구 + 빈 목차, 원문·예외 메시지는 기록하지 않는다', () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		const glossary = new Proxy(
			{},
			{
				ownKeys() {
					throw new Error('boom 비밀본문-ZZZ');
				}
			}
		) as Record<string, string>;
		const body = '## 비밀본문-ZZZ\n\n민감한 내용 비밀본문-ZZZ';
		const r = renderReport(body, { glossary });
		expect(r.fallback).toBe('render-error');
		expect(r.a).toBe(`<p>${RENDER_ERROR_MESSAGE}</p>`);
		expect(r.b).toBe('');
		expect(r.toc).toEqual([]);
		expect(r.hasSplit).toBe(false);
		expect(JSON.stringify(r)).not.toContain('비밀본문');
		expect(err).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(err.mock.calls)).not.toContain('비밀본문');
	});
});

describe('Nit: 빈 class 제거', () => {
	it('허용 밖 코드 언어면 class 속성 자체가 없다', () => {
		const r = renderReport('```js" onclick\nx\n```');
		expect(r.a).not.toContain('class=""');
		expect(sanitizeFragment('<p class="sr-only">x</p>')).toBe('<p>x</p>');
	});
});
