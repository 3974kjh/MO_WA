import { describe, expect, it, vi } from 'vitest';
import { AuthError, type User, type UserResponse } from '@supabase/supabase-js';
import {
	authGuardRedirect,
	cache,
	isMcpApiPath,
	resolveAuthenticatedUser
} from './auth';

describe('BE-02 auth.getUser transition', () => {
	it('cache memoizes the first result (R-SYS auth)', () => {
		const fn = vi.fn(() => Promise.resolve('once'));
		const cached = cache(fn);

		const first = cached();
		const second = cached();

		expect(first).toBe(second);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('forged cookie (signature mismatch / Auth error) does not yield a user', () => {
		const forged: UserResponse = {
			data: { user: null },
			error: new AuthError('invalid JWT: unable to parse or verify signature', 401)
		};

		expect(resolveAuthenticatedUser(forged)).toBeNull();
	});

	it('verified getUser result exposes the user', () => {
		const user = { id: 'user-1', email: 'a@b.c' } as User;
		const ok: UserResponse = { data: { user }, error: null };
		expect(resolveAuthenticatedUser(ok)).toEqual(user);
	});

	it('protected routes redirect unauthenticated users to login', () => {
		expect(authGuardRedirect(null, '/')).toBe('/login');
		expect(authGuardRedirect(null, '/portfolio')).toBe('/login');
		expect(authGuardRedirect(null, '/login')).toBeNull();
	});

	it('login redirects authenticated users home (login regression)', () => {
		const user = { id: 'user-1' } as User;
		expect(authGuardRedirect(user, '/login')).toBe('/');
		expect(authGuardRedirect(user, '/')).toBeNull();
	});

	it('logout leaves user null so guards send them to login (logout regression)', () => {
		expect(authGuardRedirect(null, '/')).toBe('/login');
	});

	it('/api/mcp skips cookie authentication path', () => {
		expect(isMcpApiPath('/api/mcp')).toBe(true);
		expect(isMcpApiPath('/api/mcp/tools')).toBe(true);
		expect(isMcpApiPath('/api/other')).toBe(false);
		expect(isMcpApiPath('/login')).toBe(false);
	});
});
