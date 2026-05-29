import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.session && url.pathname !== '/login') {
		redirect(303, '/login');
	}

	if (locals.session && url.pathname === '/login') {
		redirect(303, '/');
	}

	return {
		session: locals.session
	};
};
