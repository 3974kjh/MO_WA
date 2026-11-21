import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { authGuardRedirect } from '$lib/server/auth';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const target = authGuardRedirect(locals.user, url.pathname);
	if (target) redirect(303, target);

	return {
		user: locals.user
	};
};
