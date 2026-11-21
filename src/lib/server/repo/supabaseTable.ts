import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';

/**
 * Repo table accessor. Generated `Database` types cover M1 tables; `fromRepo`
 * still accepts string names and forces owner_id. Design contract:
 * `$lib/types/mowa.contract`.
 */
export function fromTable(db: SupabaseClient<Database>, table: string) {
	return db.from(table as keyof Database['public']['Tables']);
}
