/**
 * 리포트 본문 렌더러 (FE-15, H §4 '필수', DS §7-5, rules R-FMT-01·R-FMT-04·R-VAL-S03).
 *
 * 파이프라인 (서버 전용 — 브라우저 번들에 파서가 들어가지 않고, 결과 HTML만 내려간다)
 *   1) markdown-it `html:false` — 본문 속 raw HTML은 태그가 아니라 글자로 이스케이프된다.
 *      `:::callout warn|err|info` / `:::details 제목` 지시문만 블록으로 인식한다(plan §5-2).
 *   2) hast-util-from-html(parse5, 표준 HTML 파서) → hast-util-sanitize(허용 목록, ./schema.ts)
 *   3) sanitize 뒤 후처리(고정 값만 추가): H1으로 A/B 구분, 헤딩 id(`h-` 한글 slug)·목차(H2/H3),
 *      표 `<div class="tbl-wrap">`, 외부 링크 target/rel, 이미지 출처 정책, 용어 풀이 `<span class="gloss">`
 *   4) hast-util-to-html 직렬화(속성·텍스트 이스케이프)
 *
 * 화면에서 `{@html}`은 이 함수 결과에만 쓴다(ReportView.svelte 한 곳, 테스트로 검사).
 * DOM·jsdom에 의존하지 않아 Cloudflare Workers(workerd)에서 그대로 돈다.
 */
import MarkdownIt, { type PluginWithParams } from 'markdown-it';
import containerPlugin from 'markdown-it-container';
import type Token from 'markdown-it/lib/token.mjs';
import { fromHtml } from 'hast-util-from-html';
import { sanitize } from 'hast-util-sanitize';
import { toHtml } from 'hast-util-to-html';
import { toString } from 'hast-util-to-string';
import { SKIP, visit } from 'unist-util-visit';
import type { Element, ElementContent, Root, RootContent, Text } from 'hast';
import { renderedSchema, reportSchema } from './schema';

import type { RenderedReport, ReportPart, SanitizedHtml, TocItem } from '$lib/markdown/types';

export type { RenderedReport, ReportPart, SanitizedHtml, TocItem };

/** 렌더 입력 상한(UTF-8 바이트). 넘으면 파서를 돌리지 않고 고정 문구를 돌려준다(Low-1). 40KB 브리핑의 5배 */
export const MAX_REPORT_BYTES = 200 * 1024;
/** 헤딩 slug 본문 길이 상한(코드 포인트, `h-` 접두·`-n` 접미 제외) */
export const SLUG_MAX = 80;
/** 렌더 실패 시 고정 문구(Low-6). 원문 본문은 절대 넣지 않는다 */
export const RENDER_ERROR_MESSAGE = '리포트를 표시할 수 없습니다.';
/** 입력이 상한을 넘을 때 고정 문구(Low-1) */
export const TOO_LARGE_MESSAGE = '리포트가 너무 길어 표시할 수 없습니다.';
/**
 * 같은 출처 이미지로 쓰면 안 되는 경로 첫 세그먼트(Low-3). 이미지 요청에는 쿠키가 따라가므로
 * API·인증 라우트로 GET이 나가지 않게 한다(대소문자 무시, 디코딩·정규화 뒤 판정).
 */
export const IMAGE_PATH_DENY = ['api', 'login', 'logout'] as const;

/** sanitize를 거친 HTML만 이 타입이 된다. 이 파일 밖에서는 만들지 않는다(ReportView `{@html}` 입력) */
function asSanitized(html: string): SanitizedHtml {
	return html as SanitizedHtml;
}

export interface RenderOptions {
	/** 용어 풀이 사전: 용어 → 설명. 본문(제목·링크·코드 제외)에서 용어마다 처음 한 번만 표시한다 */
	glossary?: Readonly<Record<string, string>>;
	/** 외부 이미지 허용 호스트(https만). 비어 있으면 같은 출처 상대 경로(`/…`)만 남긴다 */
	imageHosts?: readonly string[];
	/** 내부 링크로 볼 호스트(새 창으로 열지 않음) */
	siteHosts?: readonly string[];
}

/** markdown-it가 H1을 그리는 자리. sanitize 허용 목록의 고정 class라 본문에서 흉내 낼 수 없다(html:false). */
export const H1_MARKER = 'h1-marker';

// @types/markdown-it-container는 CJS용 MarkdownIt 타입을 참조해 ESM 타입(@types/markdown-it 14)과 어긋난다. 런타임은 같은 함수다.
const container = containerPlugin as unknown as PluginWithParams;

const CALLOUT_ICON = { warn: '⚠', err: '✕', info: 'ⓘ' } as const;
type CalloutKind = keyof typeof CALLOUT_ICON;

function createMd(): MarkdownIt {
	const md = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false });
	// 링크 검사: markdown-it 기본(javascript:/vbscript:/file:/data: 차단)보다 좁게 — http(s)·mailto·상대 경로·#앵커만.
	md.validateLink = (url: string) => {
		const u = url.trim().toLowerCase();
		if (/^[a-z][a-z0-9+.-]*:/.test(u)) return /^(https?|mailto):/.test(u);
		return !u.startsWith('//');
	};

	md.use(container, 'callout', {
		validate: (params: string) => /^callout(\s+(warn|err|info))?\s*$/.test(params.trim()),
		render(tokens: Token[], idx: number) {
			const t = tokens[idx];
			if (t.nesting === 1) {
				const m = t.info.trim().match(/^callout(?:\s+(warn|err|info))?/);
				const kind = (m?.[1] ?? 'info') as CalloutKind;
				return `<div class="callout ${kind}"><b class="ic">${CALLOUT_ICON[kind]}</b><div class="callout-body">\n`;
			}
			return '</div></div>\n';
		}
	});
	md.use(container, 'details', {
		validate: (params: string) => /^details(\s|$)/.test(params.trim()),
		render(tokens: Token[], idx: number) {
			const t = tokens[idx];
			if (t.nesting === 1) {
				const title = t.info.trim().replace(/^details\s*/, '') || '자세히';
				return `<details class="details"><summary>${md.utils.escapeHtml(title)}</summary>\n`;
			}
			return '</details>\n';
		}
	});
	// H1은 A/B 표식으로만 쓴다(R-FMT-04). 화면에 그리지 않을 고정 표식 블록으로 바꾼다.
	const headingOpen = md.renderer.rules.heading_open;
	const headingClose = md.renderer.rules.heading_close;
	md.renderer.rules.heading_open = (tokens, idx, options, env, self) =>
		tokens[idx].tag === 'h1'
			? `<div class="${H1_MARKER}">`
			: headingOpen
				? headingOpen(tokens, idx, options, env, self)
				: self.renderToken(tokens, idx, options);
	md.renderer.rules.heading_close = (tokens, idx, options, env, self) =>
		tokens[idx].tag === 'h1'
			? '</div>\n'
			: headingClose
				? headingClose(tokens, idx, options, env, self)
				: self.renderToken(tokens, idx, options);
	return md;
}

const md = createMd();

/** 화면에 안 보이는 방향·폭 제어 문자(bidi 위장 등). slug·목차 글자에서 지운다 */
const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

/**
 * 헤딩 slug: `h-` + 소문자, 글자·숫자·하이픈만, 공백은 하이픈, 본문은 SLUG_MAX자까지.
 * 이미 쓴 id면 `-2`, `-3`…을 붙이되 **붙인 결과도 쓰인 적 없을 때까지** 올린다(Low-2).
 * 예: `a`, `a`, `a 2` → `h-a`, `h-a-2`, `h-a-2-2`. 같은 입력 순서면 항상 같은 결과.
 */
export function slugify(text: string, used: Set<string>): string {
	const body = [
		...text
			.normalize('NFC')
			.replace(INVISIBLE_RE, '')
			.trim()
			.toLowerCase()
			.replace(/[^\p{L}\p{N}\s-]/gu, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '')
	]
		.slice(0, SLUG_MAX)
		.join('')
		.replace(/-$/, '');
	const base = 'h-' + (body || 'section');
	let id = base;
	for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
	used.add(id);
	return id;
}

function el(
	tagName: string,
	properties: Element['properties'],
	children: ElementContent[]
): Element {
	return { type: 'element', tagName, properties, children };
}

/** A/B 표식: `# A. 요약`·`# B. 상세 근거` (H1) 또는 `A-1 …`·`B-0 …` (H2 접두) */
function h1Part(text: string): ReportPart | null {
	const m = text.trim().match(/^([AB])\s*[.)]/);
	return m ? (m[1] as ReportPart) : null;
}
function h2Part(text: string): ReportPart | null {
	const m = text.trim().match(/^([AB])-\d/);
	return m ? (m[1] as ReportPart) : null;
}

function isElement(n: RootContent | ElementContent, tag?: string): n is Element {
	return n.type === 'element' && (tag === undefined || n.tagName === tag);
}

/** 같은 출처 판정용 가짜 기준 주소. 상대 경로를 브라우저와 같은 WHATWG 규칙으로 풀어 본다 */
const BASE = new URL('https://same-origin.invalid/');

/**
 * href/src를 브라우저처럼 해석한다(앞뒤 제어 문자·공백 제거, 중간 탭·개행 제거, `\` → `/`, `..`·`%2e` 정규화).
 * 문자열 앞부분만 보고 판정하면 `/\t/evil`, `\\evil`, `\/evil`이 같은 출처로 보이므로(Low-5) 반드시 이 결과로 판정한다.
 */
function resolveUrl(raw: string): URL | null {
	try {
		return new URL(raw, BASE);
	} catch {
		return null;
	}
}

/** 공백·C0/C1 제어 문자·백슬래시가 있는지(브라우저가 지우거나 `/`로 바꾸는 글자) */
function hasUnsafeUrlChar(s: string): boolean {
	for (const ch of s) {
		const c = ch.codePointAt(0) ?? 0;
		if (c <= 0x20 || (c >= 0x7f && c <= 0x9f) || ch === '\\') return true;
	}
	return false;
}

function isSameOrigin(u: URL): boolean {
	return u.origin === BASE.origin;
}

/** 링크: 외부(http/https, 우리 호스트 아님)는 새 창 + rel. href가 sanitize에서 빠졌거나 해석이 안 되면 글자만 남긴다 */
function fixLinks(tree: Root, siteHosts: readonly string[]) {
	visit(tree, 'element', (node, index, parent) => {
		if (node.tagName !== 'a') return;
		const href = typeof node.properties.href === 'string' ? node.properties.href : '';
		const u = href ? resolveUrl(href) : null;
		const ok = u !== null && (isSameOrigin(u) || /^(https?|mailto):$/.test(u.protocol));
		if (!ok) {
			if (parent && index !== undefined) {
				parent.children.splice(index, 1, ...node.children);
				return [SKIP, index];
			}
			return;
		}
		delete node.properties.target;
		delete node.properties.rel;
		if (!isSameOrigin(u) && /^https?:$/.test(u.protocol)) {
			if (!siteHosts.includes(u.host.toLowerCase())) {
				node.properties.target = '_blank';
				node.properties.rel = ['noopener', 'noreferrer', 'nofollow'];
			}
		}
	});
}

/**
 * 같은 출처 이미지 경로 검사(Low-3·Low-5).
 * - 원문에 공백·제어 문자·`\\`가 있으면 거부(브라우저가 지우거나 바꿔 해석이 달라질 수 있는 입력)
 * - 퍼센트 디코딩 뒤 `.`·`..` 세그먼트가 있으면 거부(`/x/../api`, `/%2e%2e/api`)
 * - 해석된 경로의 첫 세그먼트가 IMAGE_PATH_DENY(대소문자 무시)면 거부
 */
function sameOriginImageOk(src: string): boolean {
	if (!src.startsWith('/') || src.startsWith('//')) return false;
	if (hasUnsafeUrlChar(src)) return false;
	let decoded: string;
	try {
		decoded = decodeURIComponent(src.split(/[?#]/)[0]);
	} catch {
		return false;
	}
	if (hasUnsafeUrlChar(decoded)) return false;
	if (decoded.split('/').some((seg) => seg === '.' || seg === '..')) return false;
	const u = resolveUrl(src);
	if (!u || !isSameOrigin(u)) return false;
	let first: string;
	try {
		first = decodeURIComponent(u.pathname.split('/')[1] ?? '');
	} catch {
		return false;
	}
	first = first.split(';')[0].toLowerCase();
	return !(IMAGE_PATH_DENY as readonly string[]).includes(first);
}

/** 이미지: 같은 출처 상대 경로(`/…`, 금지 경로 제외) 또는 허용 호스트(https)만 남긴다. 나머지는 제거 */
function fixImages(tree: Root, imageHosts: readonly string[]) {
	visit(tree, 'element', (node, index, parent) => {
		if (node.tagName !== 'img') return;
		const src = typeof node.properties.src === 'string' ? node.properties.src : '';
		let ok = sameOriginImageOk(src);
		if (!ok && /^https:/i.test(src) && !hasUnsafeUrlChar(src)) {
			const u = resolveUrl(src);
			ok = u !== null && u.protocol === 'https:' && imageHosts.includes(u.host.toLowerCase());
		}
		if (!ok) {
			if (parent && index !== undefined) {
				parent.children.splice(index, 1);
				return [SKIP, index];
			}
			return;
		}
		node.properties.loading = 'lazy';
		node.properties.decoding = 'async';
		node.properties.referrerPolicy = 'no-referrer';
	});
}

/** sanitize가 허용 밖 class를 모두 걸러 빈 목록이 되면 `class=""`가 남지 않게 지운다 */
function dropEmptyClass(tree: Root) {
	visit(tree, 'element', (node) => {
		const cls = node.properties.className;
		if (Array.isArray(cls) && cls.length === 0) delete node.properties.className;
	});
}

/** sanitize 뒤 공통 정책(링크·이미지·빈 class) */
function applyPolicies(tree: Root, opts: RenderOptions) {
	fixLinks(
		tree,
		(opts.siteHosts ?? []).map((h) => h.toLowerCase())
	);
	fixImages(
		tree,
		(opts.imageHosts ?? []).map((h) => h.toLowerCase())
	);
	dropEmptyClass(tree);
}

/** 표를 가로 스크롤 래퍼로 감싼다 */
function wrapTables(tree: Root) {
	visit(tree, 'element', (node, index, parent) => {
		if (node.tagName !== 'table' || !parent || index === undefined) return;
		if (parent.type === 'element' && hasClass(parent, 'tbl-wrap')) return;
		node.properties.className = ['tbl'];
		parent.children[index] = el('div', { className: ['tbl-wrap'] }, [node]);
		return SKIP;
	});
}

const GLOSS_SKIP = new Set(['a', 'code', 'pre', 'h2', 'h3', 'h4', 'summary', 'span']);

/** 용어 풀이: 사전에 있는 용어의 첫 등장 하나를 `<span class="gloss" title=설명 tabindex=0>`으로 감싼다 */
function applyGlossary(tree: Root, glossary: Readonly<Record<string, string>>) {
	const terms = Object.keys(glossary)
		.filter((t) => t.trim().length > 0)
		.sort((a, b) => b.length - a.length);
	if (terms.length === 0) return;
	const done = new Set<string>();
	const walk = (parent: Root | Element) => {
		for (let i = 0; i < parent.children.length; i++) {
			const child = parent.children[i];
			if (child.type === 'element') {
				if (!GLOSS_SKIP.has(child.tagName)) walk(child);
				continue;
			}
			if (child.type !== 'text') continue;
			const value = (child as Text).value;
			let best: { term: string; at: number } | null = null;
			for (const term of terms) {
				if (done.has(term)) continue;
				const at = value.indexOf(term);
				if (at >= 0 && (best === null || at < best.at)) best = { term, at };
			}
			if (!best) continue;
			done.add(best.term);
			const before = value.slice(0, best.at);
			const after = value.slice(best.at + best.term.length);
			const nodes: ElementContent[] = [];
			if (before) nodes.push({ type: 'text', value: before });
			nodes.push(
				el(
					'span',
					{
						className: ['gloss'],
						title: glossary[best.term],
						role: 'button',
						tabIndex: 0,
						dataGloss: best.term
					},
					[{ type: 'text', value: best.term }]
				)
			);
			if (after) nodes.push({ type: 'text', value: after });
			parent.children.splice(i, 1, ...nodes);
			i += nodes.length - (after ? 2 : 1);
		}
	};
	walk(tree);
}

/**
 * 2차 방어선: 임의 HTML 조각 → 허용 목록 sanitize + 링크·이미지 정책 → HTML.
 * renderReport는 markdown-it(html:false)를 거치므로 raw HTML이 여기까지 오지 않지만,
 * 1차(markdown-it)가 바뀌거나 우회돼도 이 단계만으로 막혀야 한다(Low-5: 테스트용이 아니라 실제 방어선).
 */
export function sanitizeFragment(html: string, opts: RenderOptions = {}): SanitizedHtml {
	const tree = sanitize(fromHtml(html ?? '', { fragment: true }), reportSchema) as Root;
	applyPolicies(tree, opts);
	return asSanitized(toHtml(tree));
}

/**
 * 캐시에서 읽은 렌더 결과 HTML을 다시 sanitize한다(캐시 히트 경로, ./cache.ts).
 * 렌더러가 붙이는 고정 속성(헤딩 id `h-…`, 표 래퍼, 용어 풀이 span)까지만 허용하는 renderedSchema를 쓰고,
 * 링크·이미지 정책은 다시 계산한다. 정상 렌더 결과는 바뀌지 않는다(멱등, 테스트로 검사).
 */
export function resanitizeRendered(html: string, opts: RenderOptions = {}): SanitizedHtml {
	const tree = sanitize(fromHtml(html ?? '', { fragment: true }), renderedSchema) as Root;
	applyPolicies(tree, opts);
	return asSanitized(toHtml(tree));
}

/** 입력이 MAX_REPORT_BYTES를 넘는지. UTF-16 길이 ≤ UTF-8 바이트이므로 긴 입력은 인코딩 없이 바로 거른다 */
export function isTooLarge(source: string): boolean {
	if (source.length > MAX_REPORT_BYTES) return true;
	return new TextEncoder().encode(source).length > MAX_REPORT_BYTES;
}

function fallback(message: string, reason: 'too-large' | 'render-error'): RenderedReport {
	return {
		a: asSanitized(`<p>${message}</p>`),
		b: asSanitized(''),
		hasSplit: false,
		toc: [],
		fallback: reason
	};
}

/**
 * 마크다운 → 안전한 HTML(A/B 분리) + 목차.
 * body_md는 봇·이전 데이터가 쓴 신뢰하지 않는 입력이다. 결과만 `{@html}`에 넣는다.
 * 상한 초과는 파서를 돌리지 않고, 예외는 고정 문구 + 빈 목차로 대체한다(원문·예외 메시지는 기록하지 않음).
 */
export function renderReport(source: string, opts: RenderOptions = {}): RenderedReport {
	const src = typeof source === 'string' ? source : '';
	if (isTooLarge(src)) return fallback(TOO_LARGE_MESSAGE, 'too-large');
	try {
		return renderUnchecked(src, opts);
	} catch (e) {
		// 본문·예외 메시지(파서가 입력 일부를 담을 수 있음)는 남기지 않는다
		console.error('[FE-15] renderReport failed', {
			error: e instanceof Error ? e.name : typeof e,
			length: src.length
		});
		return fallback(RENDER_ERROR_MESSAGE, 'render-error');
	}
}

function renderUnchecked(source: string, opts: RenderOptions): RenderedReport {
	const html = md.render(source);
	const parsed = fromHtml(html, { fragment: true });
	const tree = sanitize(parsed, reportSchema) as Root;

	applyPolicies(tree, opts);
	wrapTables(tree);
	if (opts.glossary) applyGlossary(tree, opts.glossary);

	const parts = splitParts(tree);
	const used = new Set<string>();
	const toc: TocItem[] = [];
	for (const { part, nodes } of parts.sections) {
		for (const n of nodes) {
			if (!isElement(n)) continue;
			if (n.tagName === 'h2' || n.tagName === 'h3' || n.tagName === 'h4') {
				const text = toString(n).replace(INVISIBLE_RE, '').trim();
				const id = slugify(text, used);
				n.properties.id = id;
				// 빈 제목(전각 공백·제어 문자뿐인 `## …`)은 목차에 넣지 않는다(id는 붙여 둔다)
				if (n.tagName !== 'h4' && text)
					toc.push({ id, text, level: n.tagName === 'h2' ? 2 : 3, part });
			}
		}
	}
	const a = parts.sections.filter((s) => s.part === 'A').flatMap((s) => s.nodes);
	const b = parts.sections.filter((s) => s.part === 'B').flatMap((s) => s.nodes);
	return {
		a: asSanitized(toHtml({ type: 'root', children: a })),
		b: asSanitized(toHtml({ type: 'root', children: b })),
		hasSplit: parts.hasSplit,
		toc
	};
}

interface Section {
	part: ReportPart;
	nodes: RootContent[];
}

function hasClass(n: Element, c: string): boolean {
	const cls = n.properties.className;
	return Array.isArray(cls) && cls.includes(c);
}

/**
 * A/B 분리(G-11, R-FMT-04): `# A. 요약`/`# B. 상세 근거` H1, 또는 (H1 표식이 없을 때) `A-`/`B-` 접두 H2.
 * H1은 화면에 그리지 않는다(제목은 title 필드, A/B는 토글이 대신한다). 첫 표식 앞(머리말)은 A에 둔다.
 * A와 B가 모두 있어야 hasSplit=true. 아니면 전체가 A이고 토글을 숨긴다.
 */
function splitParts(tree: Root): { hasSplit: boolean; sections: Section[] } {
	const isH1 = (n: RootContent): n is Element => isElement(n, 'div') && hasClass(n, H1_MARKER);
	const useH1 = tree.children.some((n) => isH1(n) && h1Part(toString(n)) !== null);
	const sections: Section[] = [{ part: 'A', nodes: [] }];
	const seen = new Set<ReportPart>();
	const enter = (p: ReportPart | null) => {
		if (!p) return;
		seen.add(p);
		if (p !== sections[sections.length - 1].part) sections.push({ part: p, nodes: [] });
	};
	for (const n of tree.children) {
		if (isH1(n)) {
			if (useH1) enter(h1Part(toString(n)));
			continue; // H1은 그리지 않는다
		}
		if (!useH1 && isElement(n, 'h2')) enter(h2Part(toString(n)));
		sections[sections.length - 1].nodes.push(n);
	}
	const hasSplit = seen.has('A') && seen.has('B');
	if (!hasSplit) {
		return { hasSplit, sections: [{ part: 'A', nodes: sections.flatMap((s) => s.nodes) }] };
	}
	return { hasSplit, sections };
}
