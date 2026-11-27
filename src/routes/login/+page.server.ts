import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { ensureUserProfile } from '$lib/server/auth';

/**
 * 인증 서버에 닿지 못한 실패(네트워크·타임아웃·5xx·해석 불가 응답)인가 — 자격 증명 오류와 구분한다(DS §7-17 '로그인 불가').
 * supabase-js(auth-js)는 네트워크 실패와 502~504·520~524·530을 AuthRetryableFetchError(status 0 또는 해당 코드)로,
 * 그 밖의 5xx를 AuthApiError(status>=500)로, JSON이 아닌 응답을 AuthUnknownError로 돌려준다.
 * 틀린 정보(400 invalid_credentials), 요청 과다(429) 등은 여기에 넣지 않는다 — 기존 확정 문장 그대로.
 */
function isAuthUnavailable(error: unknown): boolean {
	const e = error as { name?: unknown; status?: unknown } | null;
	if (!e || typeof e !== 'object') return false;
	if (e.name === 'AuthRetryableFetchError' || e.name === 'AuthUnknownError') return true;
	return typeof e.status === 'number' && e.status >= 500;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');

		if (!email || !password) {
			return fail(400, { message: '이메일과 비밀번호를 입력해 주세요.', email });
		}

		let signInError: unknown;
		try {
			({ error: signInError } = await locals.supabase.auth.signInWithPassword({
				email,
				password
			}));
		} catch {
			// 인증 호출이 던진 경우도 서버에 닿지 못한 것으로 본다. 오류 내용은 응답·로그에 싣지 않는다.
			signInError = { name: 'AuthRetryableFetchError', status: 0 };
		}

		if (signInError && isAuthUnavailable(signInError)) {
			// 오류 내용 없이 '연결 못 함'만 알린다. 비밀번호는 돌려주지 않고 이메일만 유지한다.
			return fail(503, { unavailable: true as const, checkedAt: new Date().toISOString(), email });
		}

		if (signInError) {
			return fail(400, {
				message: '이메일 또는 비밀번호가 맞지 않아요. 다시 입력해 주세요.',
				email
			});
		}

		const {
			data: { user }
		} = await locals.supabase.auth.getUser();
		if (user) await ensureUserProfile(locals.supabase, user);

		redirect(303, '/');
	}
};
