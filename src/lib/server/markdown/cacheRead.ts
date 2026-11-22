/**
 * 렌더 캐시 키·저장 값 검사 (FE-04 본문 연결). **렌더러(render.ts)를 import하지 않는다.**
 *
 * 운영 읽기 경로(`/briefings/[date]` load)는 이 모듈만 써서 `reports.body_blocks`·`toc`에 저장된 값을 읽는다.
 * 키(리포트 id + `reports.version` + RENDERER_VERSION + 옵션 지문)가 현재 값과 같고 형태·목차 검사를 통과할 때만
 * 저장된 HTML을 **다시 sanitize하지 않고** SanitizedHtml로 넘긴다. 그 밖에는 null(호출부가 준비 중 문구를 보인다).
 * 신뢰 근거는 쓰기 경로다: 두 컬럼은 service_role RPC `mowa_set_report_render_cache`만 쓴다(BE-07 마이그레이션).
 * 여기서는 아무것도 쓰지 않고, 메모리 저장도 하지 않는다.
 */
import { asSanitized } from './brand';
import type { RenderedReport, TocItem } from '$lib/markdown/types';

/** 렌더러·sanitize 스키마·후처리가 바뀌면 반드시 올린다. 히트 규칙이 느슨해지면 올림(강화만 할 때는 올리지 않아도 된다). 캐시 키에 들어감 */
export const RENDERER_VERSION = 'fe15-r4';

/** 옵션 지문에 들어가는 렌더 옵션(render.ts RenderOptions와 같은 모양. 렌더러를 import하지 않으려고 따로 둔다) */
export interface CacheKeyOptions {
	glossary?: Readonly<Record<string, string>>;
	imageHosts?: readonly string[];
	siteHosts?: readonly string[];
}

/** 렌더 옵션 지문(FNV-1a 32bit). 용어 사전·허용 호스트가 바뀌면 키가 달라진다 */
function optionsFingerprint(opts: CacheKeyOptions): string {
	const glossary = opts.glossary
		? Object.keys(opts.glossary)
				.sort()
				.map((k) => [k, opts.glossary?.[k] ?? ''])
		: [];
	const json = JSON.stringify([
		glossary,
		[...(opts.imageHosts ?? [])].map((h) => h.toLowerCase()).sort(),
		[...(opts.siteHosts ?? [])].map((h) => h.toLowerCase()).sort()
	]);
	let h = 0x811c9dc5;
	for (let i = 0; i < json.length; i++) {
		h ^= json.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, '0');
}

/**
 * 캐시 키(L-2). 구분자 `:`가 id·version 값에 섞여 서로 다른 리포트가 같은 키가 되지 않도록
 * id는 encodeURIComponent로 인코딩하고(`:` → `%3A`), version은 0 이상의 정수만 받는다.
 */
export function reportCacheKey(
	report: { id: string; version: number | string },
	opts: CacheKeyOptions = {}
): string {
	const id = String(report.id);
	if (id.length === 0) throw new Error('reportCacheKey: empty id');
	const version = String(report.version);
	if (!/^(0|[1-9]\d{0,9})$/.test(version)) throw new Error('reportCacheKey: invalid version');
	return `report:${encodeURIComponent(id)}:v${version}:${RENDERER_VERSION}:${optionsFingerprint(opts)}`;
}

const TOC_ID = /^h-[\p{L}\p{N}-]{1,120}$/u;

const EMPTY_IDS: ReadonlySet<string> = new Set();
/** `\sid="값"` 경계의 id 속성 값 집합(`data-id=`·`xid=` 같은 부분 문자열은 제외) */
function scanIds(html: string): ReadonlySet<string> {
	const out = new Set<string>();
	for (const m of html.matchAll(/\sid="([^"]*)"/g)) out.add(m[1]);
	return out;
}

function isTocItem(t: unknown): t is TocItem {
	if (typeof t !== 'object' || t === null) return false;
	const o = t as Record<string, unknown>;
	return (
		typeof o.id === 'string' &&
		TOC_ID.test(o.id) &&
		typeof o.text === 'string' &&
		o.text.trim().length > 0 &&
		(o.level === 2 || o.level === 3) &&
		(o.part === 'A' || o.part === 'B')
	);
}

/**
 * 저장소 값 검사: 키 일치 + 형태 + 목차 형식(항목 하나라도 틀리면 전체 미스).
 * - A/B 구분이 없으면(hasSplit=false) B는 빈 문자열이고 목차는 모두 A여야 한다(렌더러 출력 규칙).
 * - 목차 id는 서로 달라야 하고, 해당 영역 HTML에 공백 뒤 `id="…"` 속성으로 있어야 한다(앵커 없는 목차 거부).
 * 통과한 값만 SanitizedHtml이 된다(렌더 파이프라인이 기록한 값이라는 쓰기 경로 계약에 기댄다).
 */
export function readCachedRender(v: unknown, key: string): RenderedReport | null {
	if (typeof v !== 'object' || v === null) return null;
	const o = v as Record<string, unknown>;
	if (o.key !== key) return null;
	const bb = o.bodyBlocks as Record<string, unknown> | null | undefined;
	if (typeof bb !== 'object' || bb === null || Array.isArray(bb)) return null;
	const { a, b, hasSplit } = bb;
	if (typeof a !== 'string' || typeof b !== 'string' || typeof hasSplit !== 'boolean') return null;
	if (!Array.isArray(o.toc) || !o.toc.every(isTocItem)) return null;
	const toc = o.toc as TocItem[];
	if (new Set(toc.map((t) => t.id)).size !== toc.length) return null;
	if (!hasSplit && (b !== '' || toc.some((t) => t.part !== 'A'))) return null;
	// 영역별 id 속성을 한 번만 훑어 Set으로 만든다(O(HTML + 목차)). 태그 이름 뒤·다른 속성 뒤의 공백 다음 `id="…"`만 센다.
	const idsA = toc.some((t) => t.part === 'A') ? scanIds(a) : EMPTY_IDS;
	const idsB = toc.some((t) => t.part === 'B') ? scanIds(b) : EMPTY_IDS;
	if (!toc.every((t) => (t.part === 'A' ? idsA : idsB).has(t.id))) return null;
	return {
		a: asSanitized(a),
		b: asSanitized(b),
		hasSplit,
		toc: toc.map((t) => ({ id: t.id, text: t.text, level: t.level, part: t.part }))
	};
}

/**
 * `reports.body_blocks`·`toc` 두 컬럼(쓰기 형식: cached-render.ts cachedRenderToDbColumns)을 읽어
 * 현재 리포트 id·version·RENDERER_VERSION·옵션 지문과 맞을 때만 렌더 결과로 돌려준다. 렌더하지 않는다.
 */
export function readStoredRender(
	columns: { body_blocks: unknown; toc: unknown },
	report: { id: string; version: number | string },
	opts: CacheKeyOptions = {}
): RenderedReport | null {
	let key: string;
	try {
		key = reportCacheKey(report, opts);
	} catch {
		return null;
	}
	const bb = columns.body_blocks;
	if (typeof bb !== 'object' || bb === null || Array.isArray(bb)) return null;
	const stored = bb as Record<string, unknown>;
	return readCachedRender(
		{ key: stored.key, bodyBlocks: stored.bodyBlocks, toc: columns.toc },
		key
	);
}
