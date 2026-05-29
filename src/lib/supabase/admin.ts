import { createClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';
import { getSupabasePublicConfig, getSupabaseServiceRoleKey } from './config';

export function createSupabaseAdminClient() {
	const { url } = getSupabasePublicConfig();
	const serviceRoleKey = getSupabaseServiceRoleKey();

	if (!serviceRoleKey) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for admin Supabase operations.');
	}

	return createClient<Database>(url, serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	});
}
