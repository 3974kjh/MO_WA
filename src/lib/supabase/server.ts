import { createServerClient } from '@supabase/ssr';
import { error } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import type { Database } from '$lib/types/database.types';
import { getSupabasePublicConfig } from './config';

export function createSupabaseServerClient(cookies: Cookies) {
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
					cookies.set(name, value, { ...options, path: options.path ?? '/' });
				});
			}
		}
	});
}
