import { error } from '@sveltejs/kit';
import type { User } from '@supabase/supabase-js';

/** Require authenticated user for protected page loads/actions (BE-11). */
export function requireUser(user: User | null): User {
	if (!user?.id) error(401, 'Unauthorized');
	return user;
}
