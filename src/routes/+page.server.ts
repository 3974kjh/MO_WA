import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	forUser,
	getLatestIndicator,
	loadDashboardValuation,
	listBriefingsWithKospi
} from '$lib/server/repo';
import { parsePageParams } from '$lib/server/domain/web/pagination';

/**
 * Authenticated home / dashboard load (BE-11).
 * FE home-in-shell will move this under AppShell; valuation + recent briefings ship here first.
 */
export const load: PageServerLoad = async ({ locals, parent, url }) => {
	await parent();
	if (!locals.user?.id) redirect(303, '/login');

	const repo = forUser(locals.supabase, locals.user.id);
	const [valuation, kospi, recentBriefings] = await Promise.all([
		loadDashboardValuation(repo),
		getLatestIndicator(repo, 'kospi'),
		listBriefingsWithKospi(repo, parsePageParams(url, { defaultSize: 5 }))
	]);

	return {
		user: {
			id: locals.user.id,
			email: locals.user.email ?? null
		},
		valuation: valuation.data,
		valuationError: valuation.error?.message ?? null,
		kospi: kospi.data,
		recentBriefings: recentBriefings.data.items.slice(0, 5)
	};
};

export const actions: Actions = {
	logout: async ({ locals }) => {
		await locals.supabase.auth.signOut();
		redirect(303, '/login');
	}
};
