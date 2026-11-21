/**
 * FE-04 브리핑 상세 본문 연결(운영 load 전용). **렌더하지 않는다**(render.ts·cache.ts를 import하지 않음).
 *
 * `reports.body_blocks`·`toc`에 저장된 렌더 캐시를 읽어, 키(id + reports.version + RENDERER_VERSION + 옵션 지문)와
 * 형태·목차 검사를 모두 통과할 때만 돌려준다. 그 밖(행 없음·DB 오류·버전 불일치·형태 오류)은 null이고,
 * 화면은 준비 중 문구를 보인다. 결과를 어디에도 저장하지 않는다(메모리 캐시 없음, 쓰기는 service_role RPC만).
 */
import type { RenderedReport } from '$lib/markdown/types';
import { readStoredRender } from '$lib/server/markdown/cacheRead';
import { getReportRenderColumns, type RepoClient } from '$lib/server/repo';

/**
 * 쓰기 시점 렌더(cached-render.ts buildWriteTimeCachedRender)가 기본 옵션으로 키를 만들므로
 * 읽기도 같은 옵션({})으로 키를 계산한다. 옵션을 바꾸면 양쪽을 같이 바꿔야 한다(지문이 달라 전부 미스).
 */
const STORED_RENDER_OPTIONS = {} as const;

export async function readBriefingBody(
	repo: RepoClient,
	meta: { id: string; version: number }
): Promise<RenderedReport | null> {
	try {
		const { data, error } = await getReportRenderColumns(repo, meta.id);
		if (error) {
			logReadFailure(error);
			return null;
		}
		// 메타를 읽은 뒤 리포트가 바뀌었으면(version 다름) 쓰지 않는다
		if (!data || data.version !== meta.version) return null;
		return readStoredRender(data, meta, STORED_RENDER_OPTIONS);
	} catch (e) {
		logReadFailure(e);
		return null;
	}
}

/** DB 오류 원문은 서버 로그에만 남긴다(화면에는 준비 중 문구만) */
function logReadFailure(error: unknown) {
	const e = (typeof error === 'object' && error !== null ? error : {}) as {
		code?: unknown;
		message?: unknown;
	};
	console.error('[briefing-detail] render cache read failed', {
		code: e.code == null ? undefined : String(e.code),
		message: e.message == null ? String(error) : String(e.message)
	});
}
