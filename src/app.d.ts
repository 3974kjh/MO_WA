import type { Session, SupabaseClient } from '@supabase/supabase-js';
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
			session: Session | null;
			user: Session['user'] | null;
		}
		interface PageData {
			session: Session | null;
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
