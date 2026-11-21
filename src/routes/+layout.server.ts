import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { authGuardRedirect, toPublicUser } from '$lib/server/auth';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const target = authGuardRedirect(locals.user, url.pathname);
	if (target) redirect(303, target);

	return {
		// L-4: never serialize the full User (tokens/metadata) to the client.
		user: toPublicUser(locals.user)
	};
};
