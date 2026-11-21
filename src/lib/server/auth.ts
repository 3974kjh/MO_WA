import type { SupabaseClient, User, UserResponse } from '@supabase/supabase-js';
import type { Cookies } from '@sveltejs/kit';
import type { Database } from '$lib/types/database.types';

export type PublicUser = { id: string; email: string | null };

export type PendingSetCookie = {
	name: string;
	value: string;
	options: {
		path?: string;
		maxAge?: number;
		domain?: string;
		secure?: boolean;
		httpOnly?: boolean;
		sameSite?: boolean | 'lax' | 'strict' | 'none';
		expires?: Date;
	};
};

export type AuthUserResolution =
	| { kind: 'authenticated'; user: User }
	| { kind: 'anonymous'; user: null; clearCookies: boolean }
	| { kind: 'unavailable'; user: null; reason: string };

/**
 * Request-scoped memoization (BE-02 / L-3).
 * Caches the Promise from `supabase.auth.getUser()` so layout + page share one Auth round-trip.
 * After sign-in/sign-out in the same request, call `supabase.auth.getUser()` directly instead of locals.getUser().
 */
export function cache<T>(fn: () => T): () => T {
	let stored: T | undefined;
	let called = false;
	return () => {
		if (!called) {
			stored = fn();
			called = true;
		}
		return stored as T;
	};
}

/**
 * Outage / unavailable: do not clear cookies.
 * Includes unreachable Auth (0/5xx/retryable), rate limits (429), AuthUnknownError,
 * and non-numeric status (M-2).
 */
export function isAuthUnavailable(error: { status?: number; name?: string }): boolean {
	if (error.name === 'AuthRetryableFetchError' || error.name === 'AuthUnknownError') {
		return true;
	}

	const status = error.status;
	if (typeof status !== 'number' || Number.isNaN(status)) {
		return true;
	}

	return status === 0 || status === 429 || status >= 500;
}

/**
 * Map getUser() results for authorization (H-1 + M-2).
 * Unavailable → 503 without clearing cookies.
 * Confirmed invalid-session 4xx (e.g. refresh_token_not_found, 401/403) → anonymous + clear.
 */
export function resolveAuthenticatedUser(result: UserResponse): AuthUserResolution {
	if (!result.error) {
		if (result.data.user) return { kind: 'authenticated', user: result.data.user };
		return { kind: 'anonymous', user: null, clearCookies: false };
	}

	if (isAuthUnavailable(result.error)) {
		return { kind: 'unavailable', user: null, reason: 'auth_upstream' };
	}

	// AuthSessionMissingError (400), refresh_token_not_found (400), 401/403, other confirmed 4xx.
	return { kind: 'anonymous', user: null, clearCookies: true };
}

/** Serialize one Set-Cookie header line (option B; no reliance on error(503)). */
export function serializeSetCookieHeader(cookie: PendingSetCookie): string {
	const { name, value, options } = cookie;
	const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];

	if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
	if (options.domain) parts.push(`Domain=${options.domain}`);
	if (options.path) parts.push(`Path=${options.path}`);
	if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
	if (options.httpOnly) parts.push('HttpOnly');
	if (options.secure) parts.push('Secure');
	if (options.sameSite === true) parts.push('SameSite=Strict');
	else if (typeof options.sameSite === 'string') {
		const labeled = options.sameSite.charAt(0).toUpperCase() + options.sameSite.slice(1);
		parts.push(`SameSite=${labeled}`);
	}

	return parts.join('; ');
}

/**
 * Build a 503 and attach any cookies Auth wrote during this request (criterion 3 option B).
 * SvelteKit does not guarantee Set-Cookie when hooks return/throw without resolve().
 */
export function authUnavailableResponse(pendingCookies: PendingSetCookie[]): Response {
	const headers = new Headers({ 'content-type': 'text/plain; charset=utf-8' });
	for (const cookie of pendingCookies) {
		headers.append('set-cookie', serializeSetCookieHeader(cookie));
	}
	return new Response('Service Unavailable', { status: 503, headers });
}

/** Clear Supabase SSR auth cookie chunks so stale/invalid sessions cannot stick. */
export function clearSupabaseAuthCookies(cookies: Cookies) {
	for (const { name } of cookies.getAll()) {
		if (name.startsWith('sb-') && name.includes('-auth-token')) {
			cookies.delete(name, { path: '/' });
		}
	}
}

/** Narrow MCP path match so `/api/mcpfoo` keeps cookie auth (M-3). */
export function isMcpApiPath(pathname: string): boolean {
	return pathname === '/api/mcp' || pathname.startsWith('/api/mcp/');
}

/** Protected-route redirect decisions based on verified `user` (not session). */
export function authGuardRedirect(
	user: { id: string } | null,
	pathname: string
): '/login' | '/' | null {
	if (!user && pathname !== '/login') return '/login';
	if (user && pathname === '/login') return '/';
	return null;
}

export function toPublicUser(user: User | null): PublicUser | null {
	if (!user) return null;
	return { id: user.id, email: user.email ?? null };
}

export async function ensureUserProfile(supabase: SupabaseClient<Database>, user: User) {
	await supabase.from('profiles').upsert(
		{
			id: user.id,
			email: user.email ?? null,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'id' }
	);
}
