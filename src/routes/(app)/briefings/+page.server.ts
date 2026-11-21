import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { parseBriefingQuery, stripInvalidTagSearch } from '$lib/routing/listQuery';
import { parsePageParams } from '$lib/server/domain/web/pagination';
import { forUser, listBriefingsWithKospi } from '$lib/server/repo';
import { publicListError } from '$lib/server/web/listError';
import { requireUser } from '$lib/server/web/requireUser';

export const load: PageServerLoad = async ({ locals, url }) => {
	// 허용 밖 tag는 필터에 붙지 않으므로 주소창에서도 뺀다(나머지 쿼리는 유지, 바꿀 것 없으면 이동 없음).
	const cleaned = stripInvalidTagSearch(url.searchParams);
	if (cleaned !== null) redirect(303, `${url.pathname}${cleaned}`);
	const user = requireUser(locals.user);
	const repo = forUser(locals.supabase, user.id);
	const params = parsePageParams(url, { defaultSize: 20 });
	const query = parseBriefingQuery(url.searchParams);
	const { data, error } = await listBriefingsWithKospi(repo, params, query);
	return {
		title: '브리핑',
		query,
		briefings: data,
		// DB 오류 원문은 화면·페이지 데이터로 보내지 않는다(FE-10 Low-2).
		error: publicListError('briefings', error)
	};
};
