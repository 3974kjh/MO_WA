import { createServerClient } from '@supabase/ssr';
import { error } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import type { Database } from '$lib/types/database.types';
import type { PendingSetCookie } from '$lib/server/auth';
import { getSupabasePublicConfig } from './config';

/**
 * Create a request-scoped Supabase SSR client.
 * When `pendingCookies` is provided, every setAll mutation is also recorded so the hook
 * can attach Set-Cookie on early responses (e.g. Auth 503) — criterion 3 option B.
 */
export function createSupabaseServerClient(cookies: Cookies, pendingCookies?: PendingSetCookie[]) {
	const { url, anonKey, configured } = getSupabasePublicConfig();

	if (!configured) {
		console.error(
			'[supabase] PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY missing or placeholder; refusing silent fallback'
		);
		error(500, 'Supabase configuration is missing');
	}

	return createServerClient<Database>(url, anonKey, {
		cookieOptions: {
			// No browser Supabase auth client is used; cookies stay server-readable only (L-5).
			httpOnly: true
		},
		cookies: {
			getAll: () => cookies.getAll(),
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					const opts = { ...options, path: options.path ?? '/' };
					cookies.set(name, value, opts);
					pendingCookies?.push({ name, value, options: opts });
				});
			}
		}
	});
}
