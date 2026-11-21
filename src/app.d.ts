import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';
import type { PublicUser } from '$lib/server/auth';

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
			user: PublicUser | null;
		}
		/** FE-06 매매일지 상세 shallow routing: 열린 일지 id, 명시적으로 닫았으면 null */
		interface PageState {
			journalId?: string | null;
			/** 목록에서 pushState로 연 상세(닫기 = history.back) */
			journalFromList?: boolean;
		}
		interface Platform {
			env: Env;
			cf: CfProperties;
			ctx: ExecutionContext;
		}
	}
}

export {};
