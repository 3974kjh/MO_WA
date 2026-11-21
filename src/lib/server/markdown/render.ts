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
import { reportSchema } from './schema';

import type { RenderedReport, ReportPart, TocItem } from '$lib/markdown/types';

export type { RenderedReport, ReportPart, TocItem };

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

/** 헤딩 slug: `h-` + 소문자, 글자·숫자·하이픈만, 공백은 하이픈. 같은 이름은 `-2`, `-3`… */
export function slugify(text: string, used: Map<string, number>): string {
	const base =
		'h-' +
		(text
			.normalize('NFC')
			.trim()
			.toLowerCase()
			.replace(/[^\p{L}\p{N}\s-]/gu, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '') || 'section');
	const n = (used.get(base) ?? 0) + 1;
	used.set(base, n);
	return n === 1 ? base : `${base}-${n}`;
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

function hostOf(url: string): string | null {
	try {
		return new URL(url).host.toLowerCase();
	} catch {
		return null;
	}
}

/** 링크: 외부(http/https, 우리 호스트 아님)는 새 창 + rel. href가 sanitize에서 빠졌으면 글자만 남긴다 */
function fixLinks(tree: Root, siteHosts: readonly string[]) {
	visit(tree, 'element', (node, index, parent) => {
		if (node.tagName !== 'a') return;
		const href = typeof node.properties.href === 'string' ? node.properties.href : '';
		if (!href) {
			if (parent && index !== undefined) {
				parent.children.splice(index, 1, ...node.children);
				return [SKIP, index];
			}
			return;
		}
		if (/^https?:/i.test(href)) {
			const host = hostOf(href);
			if (!host || !siteHosts.includes(host)) {
				node.properties.target = '_blank';
				node.properties.rel = ['noopener', 'noreferrer', 'nofollow'];
			}
		}
	});
}

/** 이미지: 같은 출처 상대 경로(`/…`) 또는 허용 호스트(https)만 남긴다. 나머지는 제거 */
function fixImages(tree: Root, imageHosts: readonly string[]) {
	visit(tree, 'element', (node, index, parent) => {
		if (node.tagName !== 'img') return;
		const src = typeof node.properties.src === 'string' ? node.properties.src : '';
		const sameOrigin = src.startsWith('/') && !src.startsWith('//') && !src.startsWith('/\\');
		const host = /^https:/i.test(src) ? hostOf(src) : null;
		const ok = sameOrigin || (host !== null && imageHosts.includes(host));
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
 * 2차 방어선만 따로: 임의 HTML 조각 → 허용 목록 sanitize + 링크·이미지 정책 → HTML.
 * renderReport는 markdown-it(html:false)를 거치므로 raw HTML이 여기까지 오지 않지만,
 * 1차(markdown-it)가 바뀌거나 우회돼도 이 단계만으로 막히는지 테스트하려고 내보낸다.
 */
export function sanitizeFragment(html: string, opts: RenderOptions = {}): string {
	const tree = sanitize(fromHtml(html ?? '', { fragment: true }), reportSchema) as Root;
	fixLinks(
		tree,
		(opts.siteHosts ?? []).map((h) => h.toLowerCase())
	);
	fixImages(
		tree,
		(opts.imageHosts ?? []).map((h) => h.toLowerCase())
	);
	return toHtml(tree);
}

/**
 * 마크다운 → 안전한 HTML(A/B 분리) + 목차.
 * body_md는 봇·이전 데이터가 쓴 신뢰하지 않는 입력이다. 결과만 `{@html}`에 넣는다.
 */
export function renderReport(source: string, opts: RenderOptions = {}): RenderedReport {
	const html = md.render(source ?? '');
	const parsed = fromHtml(html, { fragment: true });
	const tree = sanitize(parsed, reportSchema) as Root;

	fixLinks(
		tree,
		(opts.siteHosts ?? []).map((h) => h.toLowerCase())
	);
	fixImages(
		tree,
		(opts.imageHosts ?? []).map((h) => h.toLowerCase())
	);
	wrapTables(tree);
	if (opts.glossary) applyGlossary(tree, opts.glossary);

	const parts = splitParts(tree);
	const used = new Map<string, number>();
	const toc: TocItem[] = [];
	for (const { part, nodes } of parts.sections) {
		for (const n of nodes) {
			if (!isElement(n)) continue;
			if (n.tagName === 'h2' || n.tagName === 'h3' || n.tagName === 'h4') {
				const text = toString(n).trim();
				const id = slugify(text, used);
				n.properties.id = id;
				if (n.tagName !== 'h4') toc.push({ id, text, level: n.tagName === 'h2' ? 2 : 3, part });
			}
		}
	}
	const a = parts.sections.filter((s) => s.part === 'A').flatMap((s) => s.nodes);
	const b = parts.sections.filter((s) => s.part === 'B').flatMap((s) => s.nodes);
	return {
		a: toHtml({ type: 'root', children: a }),
		b: toHtml({ type: 'root', children: b }),
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
