import { describe, expect, it, vi } from 'vitest';
import {
	AuthError,
	AuthSessionMissingError,
	AuthUnknownError,
	type User,
	type UserResponse
} from '@supabase/supabase-js';
import {
	authGuardRedirect,
	authUnavailableResponse,
	cache,
	clearSupabaseAuthCookies,
	isAuthUnavailable,
	isMcpApiPath,
	resolveAuthenticatedUser,
	serializeSetCookieHeader,
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
			error: new AuthError(
				'Invalid Refresh Token: Refresh Token Not Found',
				400,
				'refresh_token_not_found'
			)
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

	it('M-2: 429 from /user is unavailable and does not clear cookies', () => {
		expect(isAuthUnavailable({ status: 429 })).toBe(true);
		const result = resolveAuthenticatedUser({
			data: { user: null },
			error: new AuthError('rate limited', 429)
		});
		expect(result).toEqual({ kind: 'unavailable', user: null, reason: 'auth_upstream' });
	});

	it('M-2: AuthUnknownError is unavailable', () => {
		const err = new AuthUnknownError('wrapped', new Error('boom'));
		expect(isAuthUnavailable(err)).toBe(true);
		expect(resolveAuthenticatedUser({ data: { user: null }, error: err }).kind).toBe('unavailable');
	});

	it('M-2: non-numeric status is unavailable', () => {
		const err = new AuthError('odd');
		// AuthError may leave status undefined — treat as unavailable.
		expect(typeof err.status !== 'number' || Number.isNaN(err.status as number)).toBe(true);
		expect(isAuthUnavailable(err)).toBe(true);
		expect(resolveAuthenticatedUser({ data: { user: null }, error: err }).kind).toBe('unavailable');
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

	it('Low-1 / M-2: valued rotation keeps delete cookies and applies Secure + cache-control', () => {
		const response = authUnavailableResponse(
			[
				{
					name: 'sb-testproject-auth-token.0',
					value: '',
					options: { path: '/', httpOnly: true, maxAge: 0 }
				},
				{
					name: 'sb-testproject-auth-token',
					value: 'rotated-session',
					options: { path: '/', httpOnly: true, sameSite: 'lax' }
				}
			],
			{ secure: true }
		);
		expect(response.status).toBe(503);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		const setCookie = response.headers.getSetCookie?.() ?? [];
		const header =
			setCookie.length > 0 ? setCookie.join('\n') : (response.headers.get('set-cookie') ?? '');
		expect(header).toContain('rotated-session');
		expect(header).toContain('HttpOnly');
		expect(header).toContain('Secure');
		expect(header).toContain('Max-Age=0');
		expect(
			serializeSetCookieHeader({
				name: 'a',
				value: 'b',
				options: { path: '/' }
			})
		).toContain('a=b');
	});

	it('M-2: https secure default is applied when cookie.options.secure is unset', () => {
		const insecure = authUnavailableResponse(
			[{ name: 'sb-x-auth-token', value: 'v', options: { path: '/' } }],
			{ secure: false }
		);
		const secure = authUnavailableResponse(
			[{ name: 'sb-x-auth-token', value: 'v', options: { path: '/' } }],
			{ secure: true }
		);
		const insecureHeader = insecure.headers.get('set-cookie') ?? '';
		const secureHeader = secure.headers.get('set-cookie') ?? '';
		expect(insecureHeader).not.toContain('Secure');
		expect(secureHeader).toContain('Secure');
	});

	it('Low-1: delete-only pending cookies are dropped on 503', () => {
		const response = authUnavailableResponse([
			{
				name: 'sb-testproject-auth-token',
				value: '',
				options: { path: '/', maxAge: 0, httpOnly: true }
			}
		]);
		expect(response.status).toBe(503);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		const setCookie = response.headers.getSetCookie?.() ?? [];
		const header =
			setCookie.length > 0 ? setCookie.join('\n') : (response.headers.get('set-cookie') ?? '');
		expect(header).toBe('');
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
