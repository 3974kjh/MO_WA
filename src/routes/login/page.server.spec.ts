/**
 * 로그인 action 문구 계약 (DS §7-17, 사용자 확정 2026-11-27 13:31): 흐름은 그대로, fail() 문장 2개만 새 문장.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth', () => ({ ensureUserProfile: vi.fn() }));

const { actions } = await import('./+page.server');

function call(fields: Record<string, string>, signInError: unknown = null) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	const signInWithPassword = vi.fn(async () => ({ error: signInError }));
	const event = {
		request: new Request('http://localhost/login', { method: 'POST', body }),
		locals: { supabase: { auth: { signInWithPassword, getUser: vi.fn() } } }
	};
	return { run: () => actions.default(event as never), signInWithPassword };
}

describe('login action messages', () => {
	it('빈 칸이면 확정 문장으로 400을 돌려주고 Auth 를 부르지 않는다', async () => {
		const { run, signInWithPassword } = call({ email: ' a@b.co ', password: '' });
		const res = (await run()) as { status: number; data: { message: string; email: string } };
		expect(res.status).toBe(400);
		expect(res.data).toEqual({ message: '이메일과 비밀번호를 입력해 주세요.', email: 'a@b.co' });
		expect(signInWithPassword).not.toHaveBeenCalled();
	});

	it('틀린 정보면 어느 쪽인지 말하지 않는 확정 문장으로 400을 돌려준다', async () => {
		const { run } = call({ email: 'a@b.co', password: 'x' }, { message: 'Invalid login' });
		const res = (await run()) as { status: number; data: { message: string; email: string } };
		expect(res.status).toBe(400);
		expect(res.data).toEqual({
			message: '이메일 또는 비밀번호가 맞지 않아요. 다시 입력해 주세요.',
			email: 'a@b.co'
		});
	});
});
