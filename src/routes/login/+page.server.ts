import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { ensureUserProfile } from '$lib/server/auth';

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

		const { error } = await locals.supabase.auth.signInWithPassword({
			email,
			password
		});

		if (error) {
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
