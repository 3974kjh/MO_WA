import { dev } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { authGuardRedirect, toPublicUser } from '$lib/server/auth';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	// 로컬 개발 전용 쇼케이스(/dev/*)는 로그인 없이 연다. 운영 빌드는 dev=false라 이 분기가 없고 /dev 자체가 404다.
	if (dev && url.pathname.startsWith('/dev')) return { user: toPublicUser(locals.user) };

	const target = authGuardRedirect(locals.user, url.pathname);
	if (target) redirect(303, target);

	return {
		// L-4: never serialize the full User (tokens/metadata) to the client.
		user: toPublicUser(locals.user)
	};
};
