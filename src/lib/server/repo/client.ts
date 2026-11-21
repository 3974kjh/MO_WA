/**
 * Repository clients (design §1 / §2).
 * Bot path: service-role + owner_id forced + x-mowa-bot-id (R-SYS-01, R-PERM-03).
 * User path: session Supabase client (RLS).
 *
 * `createSupabaseAdminClient` / `$lib/supabase/admin` may only be imported from repo (and mcp/auth).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '$lib/supabase/admin';
import type { Database } from '$lib/types/database.types';

export type RepoActor =
	| { kind: 'user'; ownerId: string; botClientId: null }
	| { kind: 'bot'; ownerId: string; botClientId: string };

export type RepoClient = {
	actor: RepoActor;
	/** Underlying Supabase client (user JWT or service-role). */
	db: SupabaseClient<Database>;
};

/** Web session path — RLS enforces owner; still stamp owner_id on writes. */
export function forUser(supabase: SupabaseClient<Database>, ownerId: string): RepoClient {
	if (!ownerId) throw new Error('[R-SYS-01] ownerId is required');
	return {
		actor: { kind: 'user', ownerId, botClientId: null },
		db: supabase
	};
}

/** MCP bot path — service-role with x-mowa-bot-id header (R-PERM-03). */
export function forBot(ownerId: string, botClientId: string): RepoClient {
	if (!ownerId) throw new Error('[R-SYS-01] ownerId is required');
	if (!botClientId) throw new Error('[R-PERM-03] botClientId is required');

	const db = createSupabaseAdminClient({
		headers: { 'x-mowa-bot-id': botClientId }
	});

	return {
		actor: { kind: 'bot', ownerId, botClientId },
		db
	};
}

/** Fields the server always owns on create (R-SYS-01, R-PERM-03). */
export function serverCreateStamps(actor: RepoActor): {
	owner_id: string;
	source_bot_id: string | null;
} {
	return {
		owner_id: actor.ownerId,
		source_bot_id: actor.botClientId
	};
}

const IDENTITY_FIELDS = [
	'owner_id',
	'source_bot_id',
	'proposed_by_type',
	'proposed_by',
	'display_no',
	'display_id'
] as const;

type IdentityField = (typeof IDENTITY_FIELDS)[number];

/** Strip client-supplied identity fields before insert/update. */
export function stripClientIdentity<T extends Record<string, unknown>>(
	row: T
): Omit<T, IdentityField> {
	const out = { ...row };
	for (const key of IDENTITY_FIELDS) {
		delete out[key];
	}
	return out as Omit<T, IdentityField>;
}
