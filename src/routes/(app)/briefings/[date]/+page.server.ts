import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { parseDetailMode } from '$lib/routing/listQuery';
import { isReportDate } from '$lib/routing/briefings';
import { forUser, getDailyBriefingMeta } from '$lib/server/repo';
import { requireUser } from '$lib/server/web/requireUser';

/**
 * FE-04 브리핑 상세 `/briefings/[date]?mode=` (summary 기본, URL에서 생략).
 * 이 load는 메타만 읽고 **본문을 렌더하지 않는다**(renderReport 미호출). 본문 연결은 렌더 캐시 쓰기 권한
 * (BE-07: body_blocks·toc는 service role 렌더 경로만)이 원격에 적용된 뒤, 저장된 HTML을 읽는 연결과 함께 한다.
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = requireUser(locals.user);
	if (!isReportDate(params.date)) error(404, 'Not found');
	const repo = forUser(locals.supabase, user.id);
	const { data, error: err } = await getDailyBriefingMeta(repo, params.date);
	if (err) error(503, '잠시 후 다시 시도해 주세요.');
	if (!data) error(404, 'Not found');
	return {
		title: '브리핑',
		mode: parseDetailMode(url.searchParams),
		briefing: data
	};
};
