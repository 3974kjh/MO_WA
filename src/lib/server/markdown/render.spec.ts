import { describe, expect, it } from 'vitest';
import { fromHtml } from 'hast-util-from-html';
import { visit } from 'unist-util-visit';
import { GLOSSARY } from '$lib/content/glossary';
import { largeBriefing, sampleBriefing } from '$lib/fixtures/report';
import { renderReport, sanitizeFragment, slugify } from './render';
import { ALLOWED_TAGS } from './schema';

/** 결과 HTML을 다시 표준 파서로 읽어, 실행 가능한 것이 하나도 없는지 확인한다 */
function assertSafe(html: string) {
	const tree = fromHtml(html, { fragment: true });
	const allowed = new Set<string>(ALLOWED_TAGS);
	visit(tree, 'element', (node) => {
		expect(allowed.has(node.tagName), `허용 밖 태그 <${node.tagName}>`).toBe(true);
		for (const [k, v] of Object.entries(node.properties)) {
			const key = k.toLowerCase();
			expect(key.startsWith('on'), `이벤트 속성 ${k}`).toBe(false);
			expect(['style', 'srcdoc', 'formaction', 'action', 'xlinkhref', 'background']).not.toContain(
				key
			);
			if (key === 'href' || key === 'src') {
				// 브라우저처럼 제어문자·공백을 지운 뒤 스킴을 본다
				const u = [...String(v)]
					.filter((c) => c.charCodeAt(0) > 0x20)
					.join('')
					.toLowerCase();
				expect(u, `${k}=${v}`).not.toMatch(/^(javascript|vbscript|data|file):/);
			}
		}
	});
	expect(html.toLowerCase()).not.toMatch(/<script|<iframe|<object|<embed|<svg|<math|<style/);
}

const RAW_PAYLOADS: [string, string][] = [
	['script', '<script>alert(1)</script>'],
	['script 대문자·속성', '<SCRIPT SRC=//evil.example/x.js></SCRIPT>'],
	['img onerror', '<img src=x onerror=alert(1)>'],
	['img onerror 따옴표 없음·탭', '<img\tsrc="/a.png"\tonerror="alert(1)">'],
	['svg onload', '<svg onload=alert(1)><circle r=1 /></svg>'],
	['svg 안 script', '<svg><script>alert(1)</script></svg>'],
	[
		'svg animate href',
		'<svg><a><animate attributeName=href values=javascript:alert(1) /><text>x</text></a></svg>'
	],
	['math mXSS', '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>'],
	['noscript mXSS', '<noscript><p title="</noscript><img src=x onerror=alert(1)>">'],
	['javascript: href', '<a href="javascript:alert(1)">x</a>'],
	['javascript: 대소문자·공백', '<a href="  JaVaScRiPt:alert(1)">x</a>'],
	['javascript: 엔티티', '<a href="&#106;&#97;vascript:alert(1)">x</a>'],
	['javascript: 탭 끼움', '<a href="jav&#x09;ascript:alert(1)">x</a>'],
	['vbscript:', '<a href="vbscript:msgbox(1)">x</a>'],
	['data: href', '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>'],
	['data: img', '<img src="data:image/svg+xml,<svg onload=alert(1)>">'],
	['style expression', '<p style="width:expression(alert(1))">x</p>'],
	['style 태그', '<style>body{background:url(javascript:alert(1))}</style><p>x</p>'],
	['style url', '<div style="background:url(javascript:alert(1))">x</div>'],
	['iframe', '<iframe src="https://evil.example"></iframe>'],
	['iframe srcdoc', '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
	['object·embed', '<object data="x.swf"></object><embed src="x.swf">'],
	['중첩 태그 쪼개기', '<scr<script>ipt>alert(1)</scr</script>ipt>'],
	['중첩 a 안 img', '<a href="javascript:alert(1)"><img src=x onerror=alert(1)></a>'],
	['details ontoggle', '<details open ontoggle=alert(1)><summary>x</summary></details>'],
	['form formaction', '<form><button formaction="javascript:alert(1)">x</button></form>'],
	['meta refresh', '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">'],
	['base href', '<base href="javascript:alert(1)//">'],
	['link import', '<link rel="import" href="https://evil.example/x.html">'],
	['template', '<template><img src=x onerror=alert(1)></template>'],
	['textarea 탈출', '<textarea></textarea><img src=x onerror=alert(1)></textarea>'],
	['주석 탈출', '<!--><img src=x onerror=alert(1)>-->'],
	['CDATA', '<![CDATA[<img src=x onerror=alert(1)>]]>'],
	['속성 따옴표 깨기', '<a href="https://a.example/" title="x" onmouseover="alert(1)">x</a>'],
	['id·name clobbering', '<img name="getElementById"><a id="cookie">x</a>'],
	['class 주입', '<p class="sr-only gloss" data-x="1">x</p>']
];

describe('sanitizeFragment (2차 방어선: raw HTML 허용 목록)', () => {
	it.each(RAW_PAYLOADS)('%s', (_name, payload) => {
		const out = sanitizeFragment(payload);
		assertSafe(out);
		expect(out).not.toMatch(/onerror|onload|ontoggle|onmouseover|formaction|srcdoc/i);
		expect(out).not.toMatch(/javascript:|vbscript:|data:text/i);
	});
	it('script·style 본문은 글자로도 남지 않는다', () => {
		expect(sanitizeFragment('<script>alert(1)</script>ok')).toBe('ok');
		expect(sanitizeFragment('<style>p{}</style>ok')).toBe('ok');
	});
	it('id·name·class·data-* 는 버린다', () => {
		const out = sanitizeFragment(
			'<a id="cookie" name="x" class="gloss" data-x="1" href="/a">x</a>'
		);
		expect(out).toBe('<a href="/a">x</a>');
	});
	it('허용 태그는 남는다', () => {
		expect(sanitizeFragment('<p><strong>a</strong> <em>b</em> <code>c</code></p>')).toBe(
			'<p><strong>a</strong> <em>b</em> <code>c</code></p>'
		);
	});
});

const MD_PAYLOADS: [string, string][] = [
	['raw script', '<script>alert(1)</script>'],
	['raw img onerror', 'text <img src=x onerror=alert(1)> text'],
	['raw svg onload', '<svg onload=alert(1)>'],
	['javascript: 링크', '[x](javascript:alert(1))'],
	['JavaScript: 대소문자', '[x](JaVaScRiPt:alert(1))'],
	['javascript: 엔티티', '[x](&#106;avascript:alert(1))'],
	['javascript: 퍼센트 인코딩', '[x](javascript%3Aalert(1))'],
	['javascript: 꺾쇠 목적지', '[x](<javascript:alert(1)>)'],
	['참조형 링크', '[x][r]\n\n[r]: javascript:alert(1)'],
	['자동 링크', '<javascript:alert(1)>'],
	['vbscript', '[x](vbscript:msgbox(1))'],
	['data: 링크', '[x](data:text/html,<script>alert(1)</script>)'],
	['data: 이미지', '![x](data:image/png;base64,AAAA)'],
	['javascript: 이미지', '![x](javascript:alert(1))'],
	['프로토콜 상대 이미지', '![x](//evil.example/x.png)'],
	['외부 이미지', '![x](https://evil.example/x.png)'],
	['링크 title 따옴표 탈출', '[x](https://a.example "t\\" onmouseover=\\"alert(1))'],
	['callout 지시문 인자 주입', ':::callout warn" onclick="alert(1)\nx\n:::'],
	['details 제목 주입', ':::details <img src=x onerror=alert(1)>\nx\n:::'],
	['표 안 raw HTML', '| a |\n|---|\n| <img src=x onerror=alert(1)> |'],
	['코드 블록 안 script', '```html\n<script>alert(1)</script>\n```'],
	['인라인 style', '<p style="color:red">x</p>'],
	['iframe', '<iframe src="https://evil.example"></iframe>'],
	['중첩 태그', '<scr<script>ipt>alert(1)</script>']
];

describe('renderReport XSS (마크다운 경로)', () => {
	it.each(MD_PAYLOADS)('%s', (_name, src) => {
		const r = renderReport(src);
		assertSafe(r.a);
		assertSafe(r.b);
		// raw HTML은 태그가 아니라 글자로 남는다
		expect(r.a).not.toMatch(/<(script|img[^>]*onerror|svg|iframe)/i);
	});
	it('raw HTML은 이스케이프된 글자로 보인다', () => {
		const r = renderReport('a <script>alert(1)</script> b');
		expect(r.a).toContain('&#x3C;script>alert(1)&#x3C;/script>');
	});
	it('`{{...}}`·SQL 텍스트는 이스케이프된 채 그대로 남는다', () => {
		const r = renderReport(`값 {{user.name}} / ' OR 1=1; DROP TABLE reports; -- "x" <b>`);
		expect(r.a).toContain('{{user.name}}');
		expect(r.a).toContain("' OR 1=1; DROP TABLE reports; --");
		expect(r.a).toContain('&#x3C;b>');
		expect(r.a).not.toContain('<b>');
	});
	it('javascript: 링크는 a 없이 글자만 남는다', () => {
		const r = renderReport('[눌러](javascript:alert(1))');
		expect(r.a).not.toContain('<a');
	});
	it('외부 링크는 새 창 + rel=noopener noreferrer nofollow', () => {
		const r = renderReport('[기사](https://news.example.com/a?x=1&y=2)');
		expect(r.a).toContain(
			'<a href="https://news.example.com/a?x=1&#x26;y=2" target="_blank" rel="noopener noreferrer nofollow">기사</a>'
		);
	});
	it('내부 링크·앵커·mailto는 새 창으로 열지 않는다', () => {
		const r = renderReport('[a](/briefings/2026-11-20) [b](#h-a-1) [c](mailto:me@example.com)', {
			siteHosts: ['mo-wa.pages.dev']
		});
		expect(r.a).not.toContain('target=');
		const r2 = renderReport('[d](https://mo-wa.pages.dev/x)', { siteHosts: ['mo-wa.pages.dev'] });
		expect(r2.a).not.toContain('target=');
	});
	it('이미지: 같은 출처 상대 경로와 허용 호스트(https)만', () => {
		expect(renderReport('![a](/img/a.png)').a).toContain('<img src="/img/a.png" alt="a"');
		expect(renderReport('![a](https://cdn.example.com/a.png)').a).not.toContain('<img');
		const ok = renderReport('![a](https://cdn.example.com/a.png)', {
			imageHosts: ['cdn.example.com']
		});
		expect(ok.a).toContain('referrerpolicy="no-referrer"');
		expect(
			renderReport('![a](http://cdn.example.com/a.png)', { imageHosts: ['cdn.example.com'] }).a
		).not.toContain('<img');
	});
	it('용어 풀이 설명의 따옴표·꺾쇠도 이스케이프', () => {
		const r = renderReport('사이드카 발동', {
			glossary: { 사이드카: '"><img src=x onerror=alert(1)>' }
		});
		assertSafe(r.a);
		// 속성 값 안에서는 `"`·`&`만 이스케이프하면 된다(`<`는 속성 밖으로 못 나간다). img 요소가 생기지 않는 것은 assertSafe가 본다.
		expect(r.a).toContain('title="&#x22;><img src=x onerror=alert(1)>"');
	});
});

describe('A/B 분리 (G-11)', () => {
	it('# A. 요약 / # B. 상세 근거 H1을 인식하고 H1은 그리지 않는다', () => {
		const r = renderReport(sampleBriefing);
		expect(r.hasSplit).toBe(true);
		expect(r.a).toContain('A-1 오늘 시장 한눈에');
		expect(r.a).not.toContain('B-1 시장 상세');
		expect(r.b).toContain('B-1 시장 상세');
		expect(r.a + r.b).not.toMatch(/<h1|A\. 요약|B\. 상세 근거/);
		// 머리말(첫 표식 앞 인용)은 A에 둔다
		expect(r.a.indexOf('<blockquote>')).toBeLessThan(r.a.indexOf('A-1'));
	});
	it('H1이 없으면 A-/B- 접두 H2로 나눈다', () => {
		const r = renderReport('## A-1 요약\n\n가\n\n## A-2 둘\n\n나\n\n## B-1 상세\n\n다');
		expect(r.hasSplit).toBe(true);
		expect(r.a).toContain('A-2 둘');
		expect(r.b).toContain('B-1 상세');
		expect(r.b).not.toContain('A-1');
	});
	it('둘 다 없으면 hasSplit=false, 전체가 a', () => {
		const r = renderReport('# 제목\n\n## 1. 결론\n\n본문');
		expect(r.hasSplit).toBe(false);
		expect(r.b).toBe('');
		expect(r.a).toContain('1. 결론');
		expect(r.a).not.toContain('제목');
	});
	it('A만 있고 B가 없으면 나누지 않는다', () => {
		expect(renderReport('## A-1 하나\n\n가').hasSplit).toBe(false);
	});
});

describe('헤딩 id·목차·표·지시문·용어', () => {
	it('헤딩 id는 h- 접두 한글 slug, 중복은 -2', () => {
		const used = new Set<string>();
		expect(slugify('A-1 오늘 시장 한눈에', used)).toBe('h-a-1-오늘-시장-한눈에');
		expect(slugify('A-1 오늘 시장 한눈에', used)).toBe('h-a-1-오늘-시장-한눈에-2');
		expect(slugify('!!!', used)).toBe('h-section');
	});
	it('목차는 H2·H3만, part 표시', () => {
		const r = renderReport(sampleBriefing);
		expect(r.toc.map((t) => [t.level, t.part, t.text])).toEqual([
			[2, 'A', 'A-1 오늘 시장 한눈에'],
			[2, 'A', 'A-2 오늘의 테마'],
			[2, 'A', 'A-6 소스 한계'],
			[2, 'B', 'B-1 시장 상세'],
			[3, 'B', '지수'],
			[2, 'B', 'B-6 학습·가설 업데이트']
		]);
		for (const t of r.toc) expect(r.a + r.b).toContain(`id="${t.id}"`);
	});
	it('표는 tbl-wrap 래퍼 안에', () => {
		const r = renderReport('| a | b |\n|---|---|\n| 1 | 2 |');
		expect(r.a).toMatch(/^<div class="tbl-wrap"><table class="tbl">/);
	});
	it(':::callout warn|err|info → 아이콘 콜아웃, 모르는 종류는 글자로', () => {
		expect(renderReport(':::callout warn\n주의\n:::').a).toContain(
			'<div class="callout warn"><b class="ic">⚠</b><div class="callout-body">'
		);
		expect(renderReport(':::callout err\n오류\n:::').a).toContain('class="callout err"');
		expect(renderReport(':::callout\n안내\n:::').a).toContain('class="callout info"');
		expect(renderReport(':::callout danger\nx\n:::').a).not.toContain('class="callout');
	});
	it(':::details 제목 → details/summary', () => {
		const r = renderReport(':::details 수집 로그\n- a\n:::');
		expect(r.a).toContain('<details class="details"><summary>수집 로그</summary>');
	});
	it('용어 풀이: 첫 등장 한 번만, 제목·링크·코드 안은 건드리지 않는다', () => {
		const r = renderReport(
			'## 사이드카\n\n[사이드카](https://a.example) `사이드카` 오늘 사이드카, 또 사이드카',
			{ glossary: GLOSSARY }
		);
		expect(r.a.match(/class="gloss"/g)?.length).toBe(1);
		expect(r.a).toContain('<h2 id="h-사이드카">사이드카</h2>');
		expect(r.a).toContain('<code>사이드카</code>');
		expect(r.a).toContain('오늘 <span class="gloss"');
	});
});

describe('성능 (Workers CPU 한도)', () => {
	it('40KB 브리핑 렌더 회귀 경보: 가장 빠른 회차 50ms·중앙값 100ms 미만', () => {
		const src = largeBriefing();
		expect(new TextEncoder().encode(src).length).toBeGreaterThanOrEqual(40 * 1024);
		for (let i = 0; i < 3; i++) renderReport(src, { glossary: GLOSSARY }); // 워밍업(JIT)
		const times: number[] = [];
		for (let i = 0; i < 9; i++) {
			const t0 = performance.now();
			const r = renderReport(src, { glossary: GLOSSARY });
			times.push(performance.now() - t0);
			expect(r.hasSplit).toBe(true);
		}
		times.sort((a, b) => a - b);
		const [min, median, max] = [times[0], times[4], times[8]];
		process.stdout.write(
			`[FE-15] 40KB render min ${min.toFixed(1)}ms · median ${median.toFixed(1)}ms · max ${max.toFixed(1)}ms\n`
		);
		// 병렬 테스트 워커 간섭이 있어 '가장 빠른 회차'로 한도(50ms)를 보고, 중앙값은 넉넉한 회귀 경보로만 쓴다.
		expect(min).toBeLessThan(50);
		expect(median).toBeLessThan(100);
	});
});
