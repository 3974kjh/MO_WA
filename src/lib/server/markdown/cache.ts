/**
 * 리포트 렌더 결과 캐시 (FE-15 후속, FE-04 연결 전 조건).
 *
 * 40KB 렌더가 수십 ms라 Workers CPU 한도를 넘으므로 `reports.version` 단위로 결과를 저장해 다시 쓴다.
 * - 키: 리포트 id + `reports.version` + RENDERER_VERSION(+ 렌더 옵션 지문). 렌더러·sanitize 스키마가
 *   바뀌면 RENDERER_VERSION을 올려 예전 결과를 자동으로 버린다.
 * - 히트여도 저장된 HTML은 신뢰하지 않는다: `{@html}`에 가기 전에 resanitizeRendered()로 sanitize를
 *   다시 돌린다(마크다운 전체 재렌더는 생략). 목차도 형식을 다시 검사한다.
 * - 저장소는 주입한다(ReportCacheStore). 여기에는 메모리 구현만 둔다. 실제 저장소
 *   (`reports.body_blocks`·`toc`, 새 컬럼 없음)는 FE-04에서 붙인다. 이 모듈은 DB를 부르지 않는다.
 */
import { renderReport, resanitizeRendered, type RenderOptions } from './render';
import type { RenderedReport, ReportPart, TocItem } from '$lib/markdown/types';

/** 렌더러·sanitize 스키마·후처리 결과가 바뀌면 반드시 올린다(캐시 키에 들어감) */
export const RENDERER_VERSION = 'fe15-r2';

/** 저장 형식(`reports.body_blocks`·`toc`에 들어갈 값). 읽어 올 때는 신뢰하지 않는 입력으로 다룬다 */
export interface CachedRender {
	bodyBlocks: { a: string; b: string; hasSplit: boolean };
	toc: TocItem[];
}

export interface ReportCacheStore {
	get(key: string): Promise<unknown> | unknown;
	set(key: string, value: CachedRender): Promise<void> | void;
}

export interface ReportSource {
	id: string;
	version: number | string;
	body: string;
}

/** 렌더 옵션 지문(FNV-1a 32bit). 용어 사전·허용 호스트가 바뀌면 키가 달라진다 */
function optionsFingerprint(opts: RenderOptions): string {
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

export function reportCacheKey(
	report: Pick<ReportSource, 'id' | 'version'>,
	opts: RenderOptions = {}
): string {
	return `report:${report.id}:v${report.version}:${RENDERER_VERSION}:${optionsFingerprint(opts)}`;
}

const TOC_ID = /^h-[\p{L}\p{N}-]{1,120}$/u;

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

/** 저장소 값 모양 검사. 모양이 틀리면 미스로 보고 다시 렌더한다 */
function parseCached(v: unknown): CachedRender | null {
	if (typeof v !== 'object' || v === null) return null;
	const o = v as Record<string, unknown>;
	const bb = o.bodyBlocks as Record<string, unknown> | null | undefined;
	if (typeof bb !== 'object' || bb === null) return null;
	if (typeof bb.a !== 'string' || typeof bb.b !== 'string' || typeof bb.hasSplit !== 'boolean')
		return null;
	if (!Array.isArray(o.toc)) return null;
	return { bodyBlocks: { a: bb.a, b: bb.b, hasSplit: bb.hasSplit }, toc: o.toc as TocItem[] };
}

/**
 * 캐시를 거쳐 렌더한다. 미스면 renderReport() 후 저장, 히트면 저장된 HTML을 다시 sanitize해 돌려준다.
 * 고정 문구 대체(상한 초과·렌더 실패)는 저장하지 않는다.
 */
export async function renderReportCached(
	report: ReportSource,
	store: ReportCacheStore,
	opts: RenderOptions = {}
): Promise<RenderedReport> {
	const key = reportCacheKey(report, opts);
	const hit = parseCached(await store.get(key));
	if (hit) {
		return {
			a: resanitizeRendered(hit.bodyBlocks.a, opts),
			b: resanitizeRendered(hit.bodyBlocks.b, opts),
			hasSplit: hit.bodyBlocks.hasSplit,
			toc: hit.toc.filter(isTocItem).map((t) => ({
				id: t.id,
				text: t.text,
				level: t.level,
				part: t.part as ReportPart
			}))
		};
	}
	const rendered = renderReport(report.body, opts);
	if (!rendered.fallback) {
		await store.set(key, {
			bodyBlocks: { a: rendered.a, b: rendered.b, hasSplit: rendered.hasSplit },
			toc: rendered.toc
		});
	}
	return rendered;
}

/** 메모리 저장소(테스트·로컬 개발용). 운영 저장소가 아니다 */
export function createMemoryReportCache(): ReportCacheStore & {
	readonly map: Map<string, CachedRender>;
} {
	const map = new Map<string, CachedRender>();
	return {
		map,
		get: (key) => map.get(key),
		set: (key, value) => {
			map.set(key, structuredClone(value));
		}
	};
}
