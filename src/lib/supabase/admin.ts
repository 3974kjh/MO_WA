import { createClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';
import { getSupabasePublicConfig, getSupabaseServiceRoleKey } from './config';

export type AdminClientOptions = {
	/** Extra PostgREST headers (e.g. x-mowa-bot-id for DB guards). */
	headers?: Record<string, string>;
};

/**
 * Service-role Supabase client. Import only from `src/lib/server/repo/**`
 * or `src/lib/server/mcp/auth.ts` (ESLint no-restricted-imports / ADR-001).
 */
export function createSupabaseAdminClient(options: AdminClientOptions = {}) {
	const { url } = getSupabasePublicConfig();
	const serviceRoleKey = getSupabaseServiceRoleKey();

	if (!serviceRoleKey) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for admin Supabase operations.');
	}

	return createClient<Database>(url, serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		},
		global: options.headers ? { headers: options.headers } : undefined
	});
}
