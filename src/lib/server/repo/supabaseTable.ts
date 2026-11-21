import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Untyped table accessor until BE-01 lands generated Database types for M1 tables.
 * Design schema is the contract (`$lib/types/mowa.contract`).
 */
export function fromTable(db: SupabaseClient, table: string) {
	// BE-01 will replace this with typed Database tables.
	return (db as SupabaseClient).from(table as never);
}
