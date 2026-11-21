import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { isUsableSupabasePublicConfig } from './publicConfig';

export { isUsableSupabasePublicConfig };

export function getSupabasePublicConfig() {
	const url = publicEnv.PUBLIC_SUPABASE_URL;
	const anonKey = publicEnv.PUBLIC_SUPABASE_ANON_KEY;
	const configured = isUsableSupabasePublicConfig(url, anonKey);

	return {
		url: configured ? (url as string).trim() : '',
		anonKey: configured ? (anonKey as string).trim() : '',
		configured
	};
}

export function getSupabaseServiceRoleKey() {
	return privateEnv.SUPABASE_SERVICE_ROLE_KEY;
}
