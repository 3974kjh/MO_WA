import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

/**
 * 전용 로그아웃 경로(FE-01 후속, #12 Low 2).
 * 셸 사이드바·더보기 시트·홈 버튼이 모두 POST `/logout`(기본 액션)으로 보낸다.
 * SvelteKit 폼 액션이라 origin 검사(CSRF)를 그대로 받는다. 로그인 여부와 관계없이 /login으로 보낸다.
 */
export const load: PageServerLoad = async () => {
	// GET /logout은 화면이 없다. 로그아웃은 POST로만 한다.
	redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ locals }) => {
		await locals.supabase.auth.signOut();
		redirect(303, '/login');
	}
};
