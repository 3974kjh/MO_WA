import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';

export async function ensureUserProfile(supabase: SupabaseClient<Database>, user: User) {
	await supabase.from('profiles').upsert(
		{
			id: user.id,
			email: user.email ?? null,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'id' }
	);
}
