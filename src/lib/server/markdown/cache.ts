/**
 * 리포트 렌더 결과 캐시 (FE-15 후속, FE-04 연결 전 조건).
 *
 * 40KB 렌더가 수십 ms라 Workers CPU 한도(무료 10ms)를 넘으므로 `reports.version` 단위로 결과를 저장해 다시 쓴다.
 *
 * 신뢰 모델(개발 리드 결정)
 * - 키: 리포트 id + `reports.version` + RENDERER_VERSION + 렌더 옵션 지문. 저장 값 안에도 키를 넣어 두고,
 *   읽을 때 키가 같고 저장 형태·목차 형식 검사를 통과하면 **다시 sanitize하지 않고** 저장된 HTML을 그대로 쓴다.
 * - 변조 방어는 쓰기 경로다(HMAC·재-sanitize가 아님). `body_blocks`·`toc`는 렌더 파이프라인
 *   (renderReportCached의 미스 경로, 이후 BE-07 `upsert_report`의 쓰기 시점 렌더)만 기록한다.
 *   클라이언트·봇이 보낸 `body_blocks`·`toc`는 stripRenderFields()로 버리고 절대 저장소에 넘기지 않는다.
 * - CachedRender의 HTML은 SanitizedHtml 타입이라, 어댑터가 일반 string으로 만들어 set()에 넣을 수 없다.
 * - 키가 다르거나 형태가 틀리면 미스: 마크다운 + sanitize를 다시 하고 저장한다.
 * - 고정 문구 대체(상한 초과·렌더 실패)는 저장하지 않는다.
 * - 저장소는 주입한다(ReportCacheStore). 여기에는 메모리 구현만 둔다. 실제 저장소
 *   (`reports.body_blocks`·`toc`, 새 컬럼 없음)는 FE-04에서 붙인다. 이 모듈은 DB를 부르지 않는다.
 */
import { renderReport, type RenderOptions } from './render';
import { asSanitized } from './brand';
import type { RenderedReport, SanitizedHtml, TocItem } from '$lib/markdown/types';

/** 렌더러·sanitize 스키마·후처리·캐시 히트 규칙이 바뀌면 반드시 올린다(캐시 키에 들어감) */
export const RENDERER_VERSION = 'fe15-r3';

/** 저장 형식(`reports.body_blocks`·`toc`에 들어갈 값). 렌더 파이프라인만 만든다 */
export interface CachedRender {
	/** 이 값을 만든 캐시 키. 읽을 때 현재 키와 같아야 히트 */
	key: string;
	bodyBlocks: { a: SanitizedHtml; b: SanitizedHtml; hasSplit: boolean };
	toc: TocItem[];
}

export interface ReportCacheStore {
	/** 저장소 값을 그대로 돌려준다. 형태는 여기서 검사하므로 unknown이다 */
	get(key: string): Promise<unknown> | unknown;
	/** renderReportCached의 미스 경로만 부른다. 다른 곳에서 부르지 않는다 */
	set(key: string, value: CachedRender): Promise<void> | void;
}

export interface ReportSource {
	id: string;
	version: number | string;
	body: string;
}

/** 렌더 결과로 채우는 필드. 외부(클라이언트·봇) 입력에 있으면 버린다 */
export const RENDER_FIELDS = ['body_blocks', 'toc', 'bodyBlocks'] as const;
type RenderField = (typeof RENDER_FIELDS)[number];

/**
 * 쓰기 경로 계약: 클라이언트·봇이 보낸 리포트 입력에서 렌더 결과 필드(`body_blocks`·`toc`)를 지운다.
 * FE-04/BE 어댑터는 저장 전에 반드시 이 함수를 거치고, 렌더 결과는 renderReportCached가 채운다.
 */
export function stripRenderFields<T extends Record<string, unknown>>(
	input: T
): Omit<T, RenderField> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(input)) {
		if (!(RENDER_FIELDS as readonly string[]).includes(k)) out[k] = v;
	}
	return out as Omit<T, RenderField>;
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

/**
 * 저장소 값 검사: 키 일치 + 형태 + 목차 형식(항목 하나라도 틀리면 전체 미스).
 * 통과한 값만 SanitizedHtml이 된다(렌더 파이프라인이 기록한 값이라는 쓰기 경로 계약에 기댄다).
 */
function readCached(v: unknown, key: string): RenderedReport | null {
	if (typeof v !== 'object' || v === null) return null;
	const o = v as Record<string, unknown>;
	if (o.key !== key) return null;
	const bb = o.bodyBlocks as Record<string, unknown> | null | undefined;
	if (typeof bb !== 'object' || bb === null) return null;
	if (typeof bb.a !== 'string' || typeof bb.b !== 'string' || typeof bb.hasSplit !== 'boolean')
		return null;
	if (!Array.isArray(o.toc) || !o.toc.every(isTocItem)) return null;
	const ids = new Set(o.toc.map((t) => t.id));
	if (ids.size !== o.toc.length) return null;
	return {
		a: asSanitized(bb.a),
		b: asSanitized(bb.b),
		hasSplit: bb.hasSplit,
		toc: o.toc.map((t) => ({ id: t.id, text: t.text, level: t.level, part: t.part }))
	};
}

/**
 * 캐시를 거쳐 렌더한다. 히트면 저장 값을 그대로(재-sanitize·재렌더 없음), 미스면 renderReport() 후 저장.
 * 고정 문구 대체(상한 초과·렌더 실패)는 저장하지 않는다.
 */
export async function renderReportCached(
	report: ReportSource,
	store: ReportCacheStore,
	opts: RenderOptions = {}
): Promise<RenderedReport> {
	const key = reportCacheKey(report, opts);
	const hit = readCached(await store.get(key), key);
	if (hit) return hit;
	const rendered = renderReport(report.body, opts);
	if (!rendered.fallback) {
		await store.set(key, {
			key,
			bodyBlocks: { a: rendered.a, b: rendered.b, hasSplit: rendered.hasSplit },
			toc: rendered.toc
		});
	}
	return rendered;
}

/** 메모리 저장소(테스트·로컬 개발용). 운영 저장소가 아니다 */
export function createMemoryReportCache(): ReportCacheStore & {
	readonly map: Map<string, unknown>;
} {
	const map = new Map<string, unknown>();
	return {
		map,
		get: (key) => map.get(key),
		set: (key, value) => {
			map.set(key, structuredClone(value));
		}
	};
}
