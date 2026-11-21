import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/** G-3 / BE-11: /approvals → /portfolio#queue */
export const load: PageLoad = async () => {
	redirect(303, '/portfolio#queue');
};
