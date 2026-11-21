import type { SupabaseClient, User, UserResponse } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';

/**
 * Request-scoped memoization (BE-02).
 * Ensures `supabase.auth.getUser()` is invoked at most once per request.
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

/** Trust only Auth-server-verified user records; forged/invalid cookies yield null. */
export function resolveAuthenticatedUser(result: UserResponse): User | null {
	if (result.error) return null;
	return result.data.user ?? null;
}

/** MCP Bearer auth must not go through cookie session validation. */
export function isMcpApiPath(pathname: string): boolean {
	return pathname.startsWith('/api/mcp');
}

/** Protected-route redirect decisions based on verified `user` (not session). */
export function authGuardRedirect(
	user: User | null,
	pathname: string
): '/login' | '/' | null {
	if (!user && pathname !== '/login') return '/login';
	if (user && pathname === '/login') return '/';
	return null;
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
