import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { HOME_BRIEFINGS_PAGE } from '$lib/server/domain/web/homePage';
import {
	forUser,
	getLatestIndicator,
	listBriefingsWithKospi,
	loadDashboardValuation
} from '$lib/server/repo';
import { INFO_LOAD_ERROR, publicListError } from '$lib/server/web/listError';

/**
 * 홈(`/`) — (app) 셸 안. BE-11 dashboard valuation + kospi + recent briefings.
 * L-8: `?page` / `?pageSize`를 받지 않고 page 1 · size 5로 고정한다.
 * 로그아웃은 전용 경로 `/logout`(LOGOUT_PATH) — 여기로 action을 옮기지 않는다.
 */
export const load: PageServerLoad = async ({ locals, parent }) => {
	await parent();
	if (!locals.user?.id) redirect(303, '/login');

	const repo = forUser(locals.supabase, locals.user.id);
	const [valuation, kospi, recentBriefings] = await Promise.all([
		loadDashboardValuation(repo),
		getLatestIndicator(repo, 'kospi'),
		listBriefingsWithKospi(repo, HOME_BRIEFINGS_PAGE)
	]);

	return {
		user: {
			id: locals.user.id,
			email: locals.user.email ?? null
		},
		valuation: valuation.data,
		valuationError: publicListError('home.valuation', valuation.error, INFO_LOAD_ERROR),
		kospi: kospi.data,
		recentBriefings: recentBriefings.data.items.slice(0, 5)
	};
};
