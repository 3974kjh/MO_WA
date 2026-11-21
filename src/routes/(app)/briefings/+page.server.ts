import type { PageServerLoad } from './$types';
import { parseBriefingQuery } from '$lib/routing/listQuery';
import { parsePageParams } from '$lib/server/domain/web/pagination';
import { forUser, listBriefingsWithKospi } from '$lib/server/repo';
import { publicListError } from '$lib/server/web/listError';
import { requireUser } from '$lib/server/web/requireUser';

export const load: PageServerLoad = async ({ locals, url }) => {
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
