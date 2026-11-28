import type { PageServerLoad } from './$types';
import { buildComplexMapModel } from '$lib/maps/points';
import { parseRealestateQuery } from '$lib/realestate/view';
import { forUser, listRecentComplexSnapshots, listReComplexesForMap } from '$lib/server/repo';
import { INFO_LOAD_ERROR, LIST_LOAD_ERROR, publicListError } from '$lib/server/web/listError';
import { readNaverMapKeyId } from '$lib/server/web/naverMapKey';
import { requireUser } from '$lib/server/web/requireUser';

/**
 * FE-12 `/realestate` 골격 + ⑤ 지도 탭(읽기 전용). 지금 열린 탭은 지도 하나다(나머지는 준비 중).
 * - 단지 목록을 못 읽으면 탭 전체 오류(원문은 서버 로그만). 가격 스냅샷만 실패하면 가격 없이 보인다.
 * - 네이버 지도 Client ID는 이 load에서만 내려준다(없으면 null → 폴백). 정적 HTML·번들에 박지 않는다.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals.user);
	const repo = forUser(locals.supabase, user.id);
	const query = parseRealestateQuery(url.searchParams);
	const loadedAt = new Date().toISOString();

	const cx = await listReComplexesForMap(repo);
	const error = publicListError('realestate.complexes', cx.error, LIST_LOAD_ERROR);
	const snaps = error
		? null
		: await listRecentComplexSnapshots(
				repo,
				cx.data.map((c) => c.id)
			);
	const priceError = snaps
		? publicListError('realestate.snapshots', snaps.error, INFO_LOAD_ERROR)
		: null;
	const model = error
		? { items: [], located: 0, missing: 0, priceAsOf: null }
		: buildComplexMapModel(cx.data, snaps?.error ? [] : (snaps?.data ?? []));

	return {
		title: '부동산',
		query,
		loadedAt,
		error,
		priceError,
		mapKeyId: readNaverMapKeyId(),
		...model
	};
};
