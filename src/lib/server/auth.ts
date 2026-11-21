import type { SupabaseClient, User, UserResponse } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';

export type PublicUser = { id: string; email: string | null };

export type AuthUserResolution =
	| { kind: 'authenticated'; user: User }
	| { kind: 'anonymous'; user: null }
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
 * Map getUser() results for authorization (L-2).
 * Only 401/403 (and missing-session) become anonymous. Auth 5xx / network → unavailable (503).
 */
export function resolveAuthenticatedUser(result: UserResponse): AuthUserResolution {
	if (!result.error) {
		if (result.data.user) return { kind: 'authenticated', user: result.data.user };
		return { kind: 'anonymous', user: null };
	}

	const { error } = result;
	const status = error.status;
	const name = error.name;

	// No cookie / no session is unauthenticated, not an upstream outage.
	if (name === 'AuthSessionMissingError') {
		return { kind: 'anonymous', user: null };
	}

	if (status === 401 || status === 403) {
		return { kind: 'anonymous', user: null };
	}

	if (name === 'AuthRetryableFetchError' || (typeof status === 'number' && status >= 500)) {
		return { kind: 'unavailable', user: null, reason: 'auth_upstream' };
	}

	return { kind: 'unavailable', user: null, reason: 'auth_unexpected' };
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
