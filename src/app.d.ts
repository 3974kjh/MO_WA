import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';

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
		// interface Platform {}
	}
}

export {};
