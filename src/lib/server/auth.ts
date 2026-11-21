import type { SupabaseClient, User, UserResponse } from '@supabase/supabase-js';
import type { Cookies } from '@sveltejs/kit';
import type { Database } from '$lib/types/database.types';

export type PublicUser = { id: string; email: string | null };

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

function isAuthUnreachable(error: { status?: number; name?: string }): boolean {
	if (error.name === 'AuthRetryableFetchError') return true;
	const status = error.status;
	return status === 0 || (typeof status === 'number' && status >= 500);
}

/**
 * Map getUser() results for authorization (H-1).
 * 503/unavailable only when Auth could not be reached (status 0, 5xx, AuthRetryableFetchError).
 * All other errors (including 4xx such as refresh_token_not_found) are anonymous.
 */
export function resolveAuthenticatedUser(result: UserResponse): AuthUserResolution {
	if (!result.error) {
		if (result.data.user) return { kind: 'authenticated', user: result.data.user };
		return { kind: 'anonymous', user: null, clearCookies: false };
	}

	if (isAuthUnreachable(result.error)) {
		return { kind: 'unavailable', user: null, reason: 'auth_upstream' };
	}

	// AuthSessionMissingError (400), refresh_token_not_found (400), 401/403, other 4xx → anonymous.
	return { kind: 'anonymous', user: null, clearCookies: true };
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
