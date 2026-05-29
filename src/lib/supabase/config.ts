import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

const fallbackUrl = 'https://example.supabase.co';
const fallbackAnonKey = 'public-anon-key';

export function getSupabasePublicConfig() {
	return {
		url: publicEnv.PUBLIC_SUPABASE_URL || fallbackUrl,
		anonKey: publicEnv.PUBLIC_SUPABASE_ANON_KEY || fallbackAnonKey,
		configured: Boolean(publicEnv.PUBLIC_SUPABASE_URL && publicEnv.PUBLIC_SUPABASE_ANON_KEY)
	};
}

export function getSupabaseServiceRoleKey() {
	return privateEnv.SUPABASE_SERVICE_ROLE_KEY;
}
