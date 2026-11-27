/**
 * 로그인 action 문구 계약 (DS §7-17, 사용자 확정 2026-11-27 13:31): 흐름은 그대로, fail() 문장 2개만 새 문장.
 */
import { AuthApiError, AuthRetryableFetchError, AuthUnknownError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth', () => ({ ensureUserProfile: vi.fn() }));

const { actions } = await import('./+page.server');

function call(
	fields: Record<string, string>,
	signInError: unknown = null,
	signIn?: () => Promise<{ error: unknown }>
) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	const signInWithPassword = vi.fn(signIn ?? (async () => ({ error: signInError })));
	const getUser = vi.fn();
	const event = {
		request: new Request('http://localhost/login', { method: 'POST', body }),
		locals: { supabase: { auth: { signInWithPassword, getUser } } }
	};
	return { run: () => actions.default(event as never), signInWithPassword, getUser };
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

// 로그인 불가 신호(DS §7-17, 사용자 확정 2026-11-27 15:35): 인증 서버에 닿지 못한 실패만 구분한다.
describe('login action — auth-unavailable 신호', () => {
	type Fail = { status: number; data: Record<string, unknown> };
	const FIXED = new Date('2026-11-27T04:04:30.000Z');

	const unavailableCases: [string, () => Promise<{ error: unknown }>][] = [
		[
			'네트워크 실패(AuthRetryableFetchError status 0)',
			async () => ({ error: new AuthRetryableFetchError('fetch failed', 0) })
		],
		[
			'게이트웨이 502~504·52x(AuthRetryableFetchError)',
			async () => ({ error: new AuthRetryableFetchError('bad gateway', 502) })
		],
		[
			'그 밖의 5xx(AuthApiError 500)',
			async () => ({ error: new AuthApiError('boom', 500, undefined) })
		],
		[
			'JSON 아닌 응답(AuthUnknownError)',
			async () => ({ error: new AuthUnknownError('html', new Error('x')) })
		],
		[
			'인증 호출이 던짐',
			async () => {
				throw new TypeError('socket hang up secret-host.supabase.co');
			}
		]
	];

	for (const [name, signIn] of unavailableCases) {
		it(`${name} → 503 {unavailable, checkedAt, email} 만 돌려주고 오류 내용은 없다`, async () => {
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(FIXED);
			try {
				const { run, getUser } = call({ email: ' a@b.co ', password: 'pw' }, null, signIn);
				const res = (await run()) as Fail;
				expect(res.status).toBe(503);
				expect(res.data).toEqual({
					unavailable: true,
					checkedAt: '2026-11-27T04:04:30.000Z',
					email: 'a@b.co'
				});
				const dump = JSON.stringify(res);
				expect(dump).not.toContain('supabase.co');
				expect(dump).not.toContain('pw"');
				expect(dump).not.toContain('message');
				expect(getUser).not.toHaveBeenCalled();
			} finally {
				vi.useRealTimers();
			}
		});
	}

	it('자격 증명 오류(400 invalid_credentials)는 불가가 아니라 기존 확정 문장이다', async () => {
		const { run } = call(
			{ email: 'a@b.co', password: 'x' },
			new AuthApiError('Invalid login credentials', 400, 'invalid_credentials')
		);
		const res = (await run()) as Fail;
		expect(res.status).toBe(400);
		expect(res.data).toEqual({
			message: '이메일 또는 비밀번호가 맞지 않아요. 다시 입력해 주세요.',
			email: 'a@b.co'
		});
	});

	it('요청 과다(429)·이메일 미확인(400)도 불가로 보지 않는다(기존 문장 유지)', async () => {
		for (const err of [
			new AuthApiError('rate limit', 429, 'over_request_rate_limit'),
			new AuthApiError('Email not confirmed', 400, 'email_not_confirmed')
		]) {
			const { run } = call({ email: 'a@b.co', password: 'x' }, err);
			const res = (await run()) as Fail;
			expect(res.status).toBe(400);
			expect(res.data.unavailable).toBeUndefined();
		}
	});

	it('빈 칸은 불가 판정 전에 막혀 Auth 를 부르지 않는다', async () => {
		const { run, signInWithPassword } = call({ email: '', password: '' });
		const res = (await run()) as Fail;
		expect(res.status).toBe(400);
		expect(res.data.unavailable).toBeUndefined();
		expect(signInWithPassword).not.toHaveBeenCalled();
	});

	it('성공하면 프로필 보장 뒤 / 로 303 이동한다(흐름 그대로)', async () => {
		const { run, getUser } = call({ email: 'a@b.co', password: 'pw' });
		getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
		await expect(run()).rejects.toMatchObject({ status: 303, location: '/' });
		expect(getUser).toHaveBeenCalledTimes(1);
	});
});
