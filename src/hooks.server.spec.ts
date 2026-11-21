import { AuthError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createSupabaseServerClient, getSupabasePublicConfig } = vi.hoisted(() => ({
	createSupabaseServerClient: vi.fn(),
	getSupabasePublicConfig: vi.fn()
}));

vi.mock('$lib/supabase/server', () => ({ createSupabaseServerClient }));
vi.mock('$lib/supabase/config', () => ({ getSupabasePublicConfig }));

import { handle } from './hooks.server';

function makeEvent(pathname = '/') {
	const locals: Record<string, unknown> = {};
	return {
		url: new URL(`http://localhost${pathname}`),
		cookies: {
			getAll: () => [],
			set: vi.fn()
		},
		locals,
		request: new Request(`http://localhost${pathname}`)
	};
}

describe('hooks.server handle (BE-02 / M-1)', () => {
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
		// Regression guard: trusting getSession alone would yield forgedUser.
		expect(seenUser).not.toEqual(forgedUser);
	});

	it('fails closed if code trusted getSession user (simulated regression check)', async () => {
		const forgedUser = { id: 'forged-id', email: 'forged@example.com' };
		createSupabaseServerClient.mockReturnValue({
			auth: {
				getSession: vi.fn(async () => ({
					data: { session: { user: forgedUser } },
					error: null
				})),
				getUser: vi.fn(async () => ({
					data: { user: null },
					error: new AuthError('invalid JWT', 401)
				}))
			}
		});

		const event = makeEvent('/');
		await handle({
			event: event as never,
			resolve: async (e: typeof event) => {
				// Current correct behavior.
				expect(e.locals.user).toBeNull();
				return new Response('ok');
			}
		} as never);
	});

	it('skips cookie auth for /api/mcp and sets locals.user=null; 401 without Authorization', async () => {
		const event = makeEvent('/api/mcp');
		const response = await handle({
			event: event as never,
			resolve: async () => new Response('should-not-run')
		} as never);

		expect(createSupabaseServerClient).not.toHaveBeenCalled();
		expect(event.locals.user).toBeNull();
		expect(response.status).toBe(401);
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

	it('returns 503 when Auth is unavailable (5xx), without setting a user', async () => {
		createSupabaseServerClient.mockReturnValue({
			auth: {
				getUser: vi.fn(async () => ({
					data: { user: null },
					error: new AuthError('boom', 500)
				}))
			}
		});

		const event = makeEvent('/');
		const response = await handle({
			event: event as never,
			resolve: async () => new Response('ok')
		} as never);

		expect(response.status).toBe(503);
		expect(event.locals.user).toBeUndefined();
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
