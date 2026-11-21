import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * 홈(`/`) — (app) 셸 안의 최소 화면(HF-1 수준: 로고·로그인 이메일·로그아웃).
 * FE-03(I-8 대시보드)에서 본문을 채운다. 로그아웃은 전용 경로 `/logout`(LOGOUT_PATH)으로 보낸다.
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
