import { createServerClient } from '@supabase/ssr';
import type { Cookies } from '@sveltejs/kit';
import type { Database } from '$lib/types/database.types';
import { getSupabasePublicConfig } from './config';

export function createSupabaseServerClient(cookies: Cookies) {
	const { url, anonKey } = getSupabasePublicConfig();

	return createServerClient<Database>(url, anonKey, {
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
