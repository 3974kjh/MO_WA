/**
 * Option-B / Low-1 / Low-2 integration: real createSupabaseServerClient + mock fetch.
 * Does not mock `$lib/supabase/server` and never pushes into pendingCookies directly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSupabasePublicConfig } = vi.hoisted(() => ({
	getSupabasePublicConfig: vi.fn()
}));

vi.mock('$lib/supabase/config', () => ({ getSupabasePublicConfig }));

import { handle } from './hooks.server';

const COOKIE_NAME = 'sb-testproject-auth-token';

function expiredSessionCookieValue() {
	const session = {
		access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.sig',
		refresh_token: 'refresh-token-value',
		expires_in: 3600,
		expires_at: Math.floor(Date.now() / 1000) - 30,
		token_type: 'bearer',
		user: {
			id: '00000000-0000-4000-8000-000000000001',
			aud: 'authenticated',
			role: 'authenticated',
			email: 'user@example.com'
		}
	};
	return `base64-${Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')}`;
}

function makeEvent(
	pathname: string,
	opts: { https?: boolean; extraCookies?: Record<string, string> } = {}
) {
	const origin = opts.https ? 'https://localhost' : 'http://localhost';
	const jar = new Map<string, string>([[COOKIE_NAME, expiredSessionCookieValue()]]);
	for (const [name, value] of Object.entries(opts.extraCookies ?? {})) {
		jar.set(name, value);
	}
	const cookies = {
		getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
		set: vi.fn((name: string, value: string, options?: { maxAge?: number }) => {
			if (value === '' || options?.maxAge === 0) jar.delete(name);
			else jar.set(name, value);
		}),
		delete: vi.fn((name: string) => {
			jar.delete(name);
		})
	};
	return {
		url: new URL(`${origin}${pathname}`),
		cookies,
		locals: {} as Record<string, unknown>,
		request: new Request(`${origin}${pathname}`),
		jar
	};
}

function setCookieHeader(response: Response): string {
	const multi = response.headers.getSetCookie?.() ?? [];
	if (multi.length > 0) return multi.join('\n');
	return response.headers.get('set-cookie') ?? '';
}

function refreshSessionPayload() {
	return {
		access_token: 'new-access-token-value-that-is-long-enough',
		refresh_token: 'new-refresh-token',
		expires_in: 3600,
		expires_at: Math.floor(Date.now() / 1000) + 3600,
		token_type: 'bearer',
		user: {
			id: '00000000-0000-4000-8000-000000000001',
			aud: 'authenticated',
			role: 'authenticated',
			email: 'user@example.com'
		}
	};
}

describe('hooks Auth unavailable (real SSR client + mock fetch)', () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		getSupabasePublicConfig.mockReturnValue({
			url: 'https://testproject.supabase.co',
			anonKey: 'test-anon-key',
			configured: true
		});
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.clearAllMocks();
	});

	it('refresh 429 → 503 with no Set-Cookie (delete-only pending is dropped)', async () => {
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/auth/v1/token')) {
				return new Response(JSON.stringify({ error: 'rate_limit', message: 'too many' }), {
					status: 429,
					headers: { 'content-type': 'application/json' }
				});
			}
			return new Response('unexpected', { status: 500 });
		}) as typeof fetch;

		const event = makeEvent('/');
		const response = await handle({
			event: event as never,
			resolve: async () => new Response('should-not-run')
		} as never);

		expect(response.status).toBe(503);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(setCookieHeader(response)).toBe('');
		expect(event.cookies.delete).not.toHaveBeenCalled();
	});

	it('HTML Auth gateway error → 503 with no Set-Cookie (delete-only pending is dropped)', async () => {
		globalThis.fetch = vi.fn(async () => {
			return new Response('<html>gateway error</html>', {
				status: 500,
				headers: { 'content-type': 'text/html' }
			});
		}) as typeof fetch;

		const event = makeEvent('/api/health');
		const response = await handle({
			event: event as never,
			resolve: async () => new Response(JSON.stringify({ ok: true }))
		} as never);

		expect(response.status).toBe(503);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(setCookieHeader(response)).toBe('');
		expect(event.cookies.delete).not.toHaveBeenCalled();
	});

	it('Low-2: refresh 200 then /user 500 → 503 with rotation cookie and fragment delete', async () => {
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/auth/v1/token') && url.includes('refresh_token')) {
				return new Response(JSON.stringify(refreshSessionPayload()), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				});
			}
			if (url.includes('/auth/v1/user')) {
				return new Response(JSON.stringify({ message: 'upstream boom' }), {
					status: 500,
					headers: { 'content-type': 'application/json' }
				});
			}
			return new Response('unexpected', { status: 500 });
		}) as typeof fetch;

		const event = makeEvent('/', {
			extraCookies: { [`${COOKIE_NAME}.0`]: 'stale-fragment' }
		});
		const response = await handle({
			event: event as never,
			resolve: async () => new Response('should-not-run')
		} as never);

		expect(response.status).toBe(503);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		const header = setCookieHeader(response);
		expect(header).toContain(`${COOKIE_NAME}=`);
		expect(header).toContain('base64-');
		expect(header).toContain('Max-Age=0');
		expect(header).toContain(`${COOKIE_NAME}.0=`);
	});

	it('Low-2: https refresh 200 then /user 500 → 503 Set-Cookie includes Secure', async () => {
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/auth/v1/token') && url.includes('refresh_token')) {
				return new Response(JSON.stringify(refreshSessionPayload()), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				});
			}
			if (url.includes('/auth/v1/user')) {
				return new Response(JSON.stringify({ message: 'upstream boom' }), {
					status: 500,
					headers: { 'content-type': 'application/json' }
				});
			}
			return new Response('unexpected', { status: 500 });
		}) as typeof fetch;

		const event = makeEvent('/', {
			https: true,
			extraCookies: { [`${COOKIE_NAME}.0`]: 'stale-fragment' }
		});
		const response = await handle({
			event: event as never,
			resolve: async () => new Response('should-not-run')
		} as never);

		expect(response.status).toBe(503);
		expect(event.url.protocol).toBe('https:');
		const header = setCookieHeader(response);
		expect(header).toContain('base64-');
		expect(header).toContain('Secure');
		expect(header).toContain('Max-Age=0');
	});
});
