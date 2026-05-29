import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '$lib/types/database.types';
import { getSupabasePublicConfig } from './config';

export function createSupabaseBrowserClient() {
	const { url, anonKey } = getSupabasePublicConfig();
	return createBrowserClient<Database>(url, anonKey);
}
