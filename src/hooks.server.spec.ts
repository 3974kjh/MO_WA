import { AuthError, AuthSessionMissingError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authGuardRedirect } from '$lib/server/auth';

const { createSupabaseServerClient, getSupabasePublicConfig } = vi.hoisted(() => ({
	createSupabaseServerClient: vi.fn(),
	getSupabasePublicConfig: vi.fn()
}));

vi.mock('$lib/supabase/server', () => ({ createSupabaseServerClient }));
vi.mock('$lib/supabase/config', () => ({ getSupabasePublicConfig }));

import { handle } from './hooks.server';

function makeEvent(pathname = '/', cookieNames: string[] = []) {
	const locals: Record<string, unknown> = {};
	const cookies = {
		getAll: () => cookieNames.map((name) => ({ name, value: 'stale' })),
		set: vi.fn(),
		delete: vi.fn()
	};
	return {
		url: new URL(`http://localhost${pathname}`),
		cookies,
		locals,
		request: new Request(`http://localhost${pathname}`)
	};
}

describe('hooks.server handle (BE-02 / M-1 / H-1)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getSupabasePublicConfig.mockReturnValue({
			url: 'https://testproject.supabase.co',
			anonKey: 'test-anon-key',
			configured: true
		});
	});

	it('sets locals.user=null when getSession would trust a forged user but getUser returns 401', async () => {
		const forgedUser = { id: 'forged-id', email: 'forged@example.com' };
		const getSession = vi.fn(async () => ({
			data: {
				session: {
					access_token: 'forged',
					refresh_token: 'forged',
					user: forgedUser
				}
			},
			error: null
		}));
		const getUser = vi.fn(async () => ({
			data: { user: null },
			error: new AuthError('invalid JWT: unable to parse or verify signature', 401)
		}));

		createSupabaseServerClient.mockReturnValue({
			auth: { getSession, getUser }
		});

		const event = makeEvent('/');
		let seenUser: unknown = 'unset';

		const response = await handle({
			event: event as never,
			resolve: async (e: typeof event) => {
				seenUser = e.locals.user;
				return new Response('ok');
			}
		} as never);

		expect(response.status).toBe(200);
		expect(getUser).toHaveBeenCalled();
		expect(seenUser).toBeNull();
		expect(seenUser).not.toEqual(forgedUser);
	});

	it('H-1: 400 refresh_token_not_found clears cookies and resolves as login redirect', async () => {
		createSupabaseServerClient.mockReturnValue({
			auth: {
				getUser: vi.fn(async () => ({
					data: { user: null },
					error: new AuthError(
						'Invalid Refresh Token: Refresh Token Not Found',
						400,
						'refresh_token_not_found'
					)
				}))
			}
		});

		const event = makeEvent('/', ['sb-testproject-auth-token', 'sb-testproject-auth-token.0']);
		let seenUser: unknown = 'unset';

		await handle({
			event: event as never,
			resolve: async (e: typeof event) => {
				seenUser = e.locals.user;
				return new Response('ok');
			}
		} as never);

		expect(seenUser).toBeNull();
		expect(authGuardRedirect(null, '/')).toBe('/login');
		expect(event.cookies.delete).toHaveBeenCalledWith('sb-testproject-auth-token', {
			path: '/'
		});
		expect(event.cookies.delete).toHaveBeenCalledWith('sb-testproject-auth-token.0', {
			path: '/'
		});
	});

	it('H-1: AuthSessionMissingError (status 400) is anonymous / login page', async () => {
		const missing = new AuthSessionMissingError();
		expect(missing.status).toBe(400);

		createSupabaseServerClient.mockReturnValue({
			auth: {
				getUser: vi.fn(async () => ({
					data: { user: null },
					error: missing
				}))
			}
		});

		const event = makeEvent('/');
		let seenUser: unknown = 'unset';

		await handle({
			event: event as never,
			resolve: async (e: typeof event) => {
				seenUser = e.locals.user;
				return new Response('ok');
			}
		} as never);

		expect(seenUser).toBeNull();
		expect(authGuardRedirect(null, '/')).toBe('/login');
	});

	it('POST /api/mcp without Authorization → 401 + WWW-Authenticate; skips cookie auth', async () => {
		const event = makeEvent('/api/mcp');
		event.request = new Request('http://localhost/api/mcp', { method: 'POST' });
		const response = await handle({
			event: event as never,
			resolve: async () => new Response('should-not-run')
		} as never);

		expect(createSupabaseServerClient).not.toHaveBeenCalled();
		expect(event.locals.user).toBeNull();
		expect(response.status).toBe(401);
		expect(response.headers.get('WWW-Authenticate')).toBe('Bearer realm="mo-wa-mcp"');
	});

	it('GET /api/mcp without Authorization reaches the route (405), skipping cookie auth', async () => {
		const event = makeEvent('/api/mcp');
		const response = await handle({
			event: event as never,
			resolve: async () => new Response(null, { status: 405, headers: { allow: 'POST' } })
		} as never);

		expect(createSupabaseServerClient).not.toHaveBeenCalled();
		expect(event.locals.user).toBeNull();
		expect(response.status).toBe(405);
		expect(response.headers.get('allow')).toBe('POST');
	});

	it('allows OPTIONS /api/mcp without Authorization', async () => {
		const event = makeEvent('/api/mcp');
		event.request = new Request('http://localhost/api/mcp', { method: 'OPTIONS' });
		const response = await handle({
			event: event as never,
			resolve: async () => new Response(null, { status: 204 })
		} as never);
		expect(response.status).toBe(204);
		expect(createSupabaseServerClient).not.toHaveBeenCalled();
	});

	it('does not skip cookie auth for /api/mcpfoo', async () => {
		createSupabaseServerClient.mockReturnValue({
			auth: {
				getUser: vi.fn(async () => ({ data: { user: null }, error: null }))
			}
		});

		const event = makeEvent('/api/mcpfoo');
		await handle({
			event: event as never,
			resolve: async () => new Response('ok')
		} as never);

		expect(createSupabaseServerClient).toHaveBeenCalled();
	});

	it('returns 500 when Supabase public config is missing', async () => {
		getSupabasePublicConfig.mockReturnValue({ url: '', anonKey: '', configured: false });
		const event = makeEvent('/');
		const response = await handle({
			event: event as never,
			resolve: async () => new Response('ok')
		} as never);
		expect(response.status).toBe(500);
		expect(createSupabaseServerClient).not.toHaveBeenCalled();
	});
});
