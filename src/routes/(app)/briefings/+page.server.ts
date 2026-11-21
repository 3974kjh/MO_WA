import type { PageServerLoad } from './$types';
import { parsePageParams } from '$lib/server/domain/web/pagination';
import { forUser, listBriefingsWithKospi } from '$lib/server/repo';
import { requireUser } from '$lib/server/web/requireUser';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals.user);
	const repo = forUser(locals.supabase, user.id);
	const params = parsePageParams(url, { defaultSize: 20 });
	const { data, error } = await listBriefingsWithKospi(repo, params);
	return {
		title: '브리핑',
		briefings: data,
		error: error?.message ?? null
	};
};
