import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

/**
 * HF-1: legacy asset/liability dashboard removed.
 * Minimal authenticated landing until FE-01 ships the app shell.
 */
export const load: PageServerLoad = async ({ locals, parent }) => {
	await parent();
	if (!locals.user?.id) redirect(303, '/login');

	return {
		user: {
			id: locals.user.id,
			email: locals.user.email ?? null
		}
	};
};

export const actions: Actions = {
	logout: async ({ locals }) => {
		await locals.supabase.auth.signOut();
		redirect(303, '/login');
	}
};
