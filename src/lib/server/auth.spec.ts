import { describe, expect, it, vi } from 'vitest';
import {
	AuthError,
	AuthSessionMissingError,
	type User,
	type UserResponse
} from '@supabase/supabase-js';
import {
	authGuardRedirect,
	cache,
	clearSupabaseAuthCookies,
	isMcpApiPath,
	resolveAuthenticatedUser,
	toPublicUser
} from './auth';
import { isUsableSupabasePublicConfig } from '$lib/supabase/publicConfig';

describe('BE-02 auth.getUser transition', () => {
	it('cache memoizes the first result (R-SYS auth)', () => {
		const fn = vi.fn(() => Promise.resolve('once'));
		const cached = cache(fn);

		const first = cached();
		const second = cached();

		expect(first).toBe(second);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('401 forged cookie resolves as anonymous and requests cookie clear', () => {
		const forged: UserResponse = {
			data: { user: null },
			error: new AuthError('invalid JWT: unable to parse or verify signature', 401)
		};

		expect(resolveAuthenticatedUser(forged)).toEqual({
			kind: 'anonymous',
			user: null,
			clearCookies: true
		});
	});

	it('403 resolves as anonymous', () => {
		const forbidden: UserResponse = {
			data: { user: null },
			error: new AuthError('forbidden', 403)
		};
		expect(resolveAuthenticatedUser(forbidden).kind).toBe('anonymous');
	});

	it('H-1: 400 refresh_token_not_found is anonymous (login + clear), not 503', () => {
		const stale: UserResponse = {
			data: { user: null },
			error: new AuthError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found')
		};
		const result = resolveAuthenticatedUser(stale);
		expect(result).toEqual({ kind: 'anonymous', user: null, clearCookies: true });
		expect(authGuardRedirect(result.user, '/')).toBe('/login');
	});

	it('H-1: AuthSessionMissingError (status 400) is anonymous / login page', () => {
		const missing: UserResponse = {
			data: { user: null },
			error: new AuthSessionMissingError()
		};
		expect(missing.error?.status).toBe(400);
		const result = resolveAuthenticatedUser(missing);
		expect(result.kind).toBe('anonymous');
		expect(result.user).toBeNull();
		expect(authGuardRedirect(result.user, '/')).toBe('/login');
	});

	it('Auth 5xx does not log the user out (unavailable → 503 path)', () => {
		const upstream: UserResponse = {
			data: { user: null },
			error: new AuthError('auth unavailable', 503)
		};
		const result = resolveAuthenticatedUser(upstream);
		expect(result.kind).toBe('unavailable');
		expect(result.user).toBeNull();
	});

	it('status 0 is unavailable (Auth unreachable)', () => {
		const result = resolveAuthenticatedUser({
			data: { user: null },
			error: new AuthError('network', 0)
		});
		expect(result.kind).toBe('unavailable');
	});

	it('network AuthRetryableFetchError is unavailable, not anonymous', () => {
		const err = new AuthError('fetch failed', 0);
		err.name = 'AuthRetryableFetchError';
		const result = resolveAuthenticatedUser({ data: { user: null }, error: err });
		expect(result.kind).toBe('unavailable');
	});

	it('clearSupabaseAuthCookies deletes sb-*-auth-token cookies', () => {
		const deleted: string[] = [];
		const cookies = {
			getAll: () => [
				{ name: 'sb-testproject-auth-token', value: 'x' },
				{ name: 'sb-testproject-auth-token.0', value: 'y' },
				{ name: 'other', value: 'z' }
			],
			delete: (name: string) => {
				deleted.push(name);
			}
		};
		clearSupabaseAuthCookies(cookies as never);
		expect(deleted).toEqual(['sb-testproject-auth-token', 'sb-testproject-auth-token.0']);
	});

	it('verified getUser result exposes the user', () => {
		const user = { id: 'user-1', email: 'a@b.c' } as User;
		const ok: UserResponse = { data: { user }, error: null };
		expect(resolveAuthenticatedUser(ok)).toEqual({ kind: 'authenticated', user });
	});

	it('toPublicUser serializes only id and email (L-4)', () => {
		const user = {
			id: 'user-1',
			email: 'a@b.c',
			app_metadata: { provider: 'email' },
			user_metadata: { secret: 'nope' }
		} as unknown as User;
		expect(toPublicUser(user)).toEqual({ id: 'user-1', email: 'a@b.c' });
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

	it('isMcpApiPath is exact /api/mcp prefix only (M-3)', () => {
		expect(isMcpApiPath('/api/mcp')).toBe(true);
		expect(isMcpApiPath('/api/mcp/tools')).toBe(true);
		expect(isMcpApiPath('/api/mcpfoo')).toBe(false);
		expect(isMcpApiPath('/api/mcp-admin')).toBe(false);
		expect(isMcpApiPath('/api/other')).toBe(false);
		expect(isMcpApiPath('/login')).toBe(false);
	});

	it('rejects missing and placeholder Supabase public config (M-2)', () => {
		expect(isUsableSupabasePublicConfig(undefined, undefined)).toBe(false);
		expect(isUsableSupabasePublicConfig('', 'x')).toBe(false);
		expect(isUsableSupabasePublicConfig('https://example.supabase.co', 'key')).toBe(false);
		expect(isUsableSupabasePublicConfig('https://abc.supabase.co', 'public-anon-key')).toBe(false);
		expect(isUsableSupabasePublicConfig('https://abc.supabase.co', 'test-anon-key')).toBe(true);
	});
});
