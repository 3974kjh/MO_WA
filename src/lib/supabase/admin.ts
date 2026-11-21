import { createClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';
import { getSupabasePublicConfig, getSupabaseServiceRoleKey } from './config';

export type AdminClientOptions = {
	/** Extra PostgREST headers (e.g. x-mowa-bot-id for DB guards). */
	headers?: Record<string, string>;
};

const PLACEHOLDER_HOSTS = new Set(['example.supabase.co']);

function assertAdminConfig(
	url: string,
	serviceRoleKey: string | undefined
): asserts serviceRoleKey is string {
	if (!serviceRoleKey) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for admin Supabase operations.');
	}
	let host: string;
	try {
		host = new URL(url).host;
	} catch {
		throw new Error('PUBLIC_SUPABASE_URL is missing or invalid for admin Supabase operations.');
	}
	// M-6: never send service-role keys to placeholder / example hosts.
	if (PLACEHOLDER_HOSTS.has(host) || host.endsWith('.example.supabase.co')) {
		throw new Error(
			'Refusing admin Supabase client: PUBLIC_SUPABASE_URL is a placeholder (example.supabase.co).'
		);
	}
	const { configured } = getSupabasePublicConfig();
	if (!configured) {
		throw new Error(
			'Refusing admin Supabase client: PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY are not configured.'
		);
	}
}

/**
 * Service-role Supabase client. Import only from `src/lib/server/repo/**`
 * or `src/lib/server/mcp/auth.ts` (ESLint no-restricted-imports / ADR-001).
 * Dynamic import of this module is also restricted (L6).
 */
export function createSupabaseAdminClient(options: AdminClientOptions = {}) {
	const { url } = getSupabasePublicConfig();
	const serviceRoleKey = getSupabaseServiceRoleKey();
	assertAdminConfig(url, serviceRoleKey);

	return createClient<Database>(url, serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		},
		global: options.headers ? { headers: options.headers } : undefined
	});
}
