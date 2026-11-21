import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';

interface Env {
	PUBLIC_SUPABASE_URL: string;
	PUBLIC_SUPABASE_ANON_KEY: string;
	SUPABASE_SERVICE_ROLE_KEY: string;
	ASSETS: Fetcher;
}

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			supabase: SupabaseClient<Database>;
			/** Request-scoped cached `supabase.auth.getUser()` (BE-02). */
			getUser: () => ReturnType<SupabaseClient<Database>['auth']['getUser']>;
			user: User | null;
		}
		interface PageData {
			user: User | null;
		}
		// interface PageState {}
		interface Platform {
			env: Env;
			cf: CfProperties;
			ctx: ExecutionContext;
		}
	}
}

export {};
