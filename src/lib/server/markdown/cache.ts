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
 * - 저장소는 주입한다(ReportCacheStore). 여기에는 저장 안 함(createNoStoreReportCache)·메모리(테스트·dev) 구현만 둔다.
 *   DB 컬럼(`reports.body_blocks`·`toc`)은 BE-07 RPC `mowa_set_report_render_cache`(service_role)만 쓰고,
 *   운영 읽기(`/briefings/[date]`)는 렌더러 없는 cacheRead.ts의 readStoredRender()로 읽기만 한다. 이 모듈은 DB를 부르지 않는다.
 */
import { renderReport, type RenderOptions } from './render';
import { RENDERER_VERSION, readCachedRender, reportCacheKey } from './cacheRead';
import type { RenderedReport, SanitizedHtml, TocItem } from '$lib/markdown/types';

/** 키·저장 값 검사는 렌더러 없는 cacheRead.ts에 있다(운영 읽기 경로가 render.ts를 끌어오지 않게) */
export { RENDERER_VERSION, reportCacheKey };

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

export { RENDER_FIELDS, isRenderFieldKey, stripRenderFields } from './renderFields';

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
	const hit = readCachedRender(await store.get(key), key);
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

/**
 * 저장하지 않는 저장소(FE-04 기본값). 히트가 없고, 미스 때 렌더 결과를 어디에도 쓰지 않는다.
 * DB 저장소(`reports.body_blocks`·`toc`)는 BE-07 컬럼 권한(service role 렌더 경로만 쓰기)과 쓰기 시점 렌더가
 * 원격에 적용된 뒤에만 연결한다. 그 전까지 운영 코드가 쓸 수 있는 저장소는 이것뿐이다.
 */
export function createNoStoreReportCache(): ReportCacheStore {
	return {
		get: () => undefined,
		set: () => {}
	};
}

/** 메모리 저장소 기본 상한(항목 수, L-4) */
export const MEMORY_CACHE_MAX_ENTRIES = 64;

/**
 * 메모리 저장소(테스트·로컬 개발용). **운영 저장소가 아니다**(조건 c): 운영 빌드(import.meta.env.PROD)에서 만들면 예외를 던지고,
 * 운영 코드에서 import하지 않는지 cache.spec.ts가 src 전체를 검사한다.
 * 상한을 넘으면 가장 오래 쓰지 않은 항목부터 지운다(LRU, L-4).
 */
export function createMemoryReportCache(
	opts: { maxEntries?: number } = {}
): ReportCacheStore & { readonly map: Map<string, unknown> } {
	if (import.meta.env?.PROD) throw new Error('createMemoryReportCache: not for production');
	const max = Math.max(1, Math.floor(opts.maxEntries ?? MEMORY_CACHE_MAX_ENTRIES));
	const map = new Map<string, unknown>();
	return {
		map,
		get: (key) => {
			if (!map.has(key)) return undefined;
			const v = map.get(key);
			map.delete(key);
			map.set(key, v);
			return v;
		},
		set: (key, value) => {
			map.delete(key);
			map.set(key, structuredClone(value));
			while (map.size > max) {
				const oldest = map.keys().next().value as string;
				map.delete(oldest);
			}
		}
	};
}
