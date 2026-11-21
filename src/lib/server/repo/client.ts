/**
 * Repository clients (design §1 / §2).
 *
 * M-4: Supabase client is stored only in a module-internal WeakMap — never on the
 * RepoClient object (no Symbol/db property to fish out). Import this file only from
 * other repo modules (ESLint blocks direct imports of repo/client outside repo).
 *
 * M-5: Repo create/update must not call runRules.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '$lib/supabase/admin';
import type { Database } from '$lib/types/database.types';
import { isBotRepoIdentity, type BotRepoIdentity } from './botIdentityBrand';

export type { BotRepoIdentity };

export type RepoActor =
	| { kind: 'user'; ownerId: string; botClientId: null }
	| { kind: 'bot'; ownerId: string; botClientId: string };

/** Opaque handle — no db field. */
export type RepoClient = {
	readonly actor: RepoActor;
};

/** Module-internal only — not exported from repo/index. */
const dbByRepo = new WeakMap<RepoClient, SupabaseClient<Database>>();

/** Internal to `repo/*` — do not re-export. */
export function getRepoDb(repo: RepoClient): SupabaseClient<Database> {
	const db = dbByRepo.get(repo);
	if (!db) throw new Error('[R-SYS-01] invalid RepoClient (no bound database)');
	return db;
}

function bindDb(actor: RepoActor, db: SupabaseClient<Database>): RepoClient {
	const repo: RepoClient = { actor };
	dbByRepo.set(repo, db);
	return repo;
}

/** Web session path — RLS enforces owner; still stamp owner_id on writes. */
export function forUser(supabase: SupabaseClient<Database>, ownerId: string): RepoClient {
	if (!ownerId) throw new Error('[R-SYS-01] ownerId is required');
	return bindDb({ kind: 'user', ownerId, botClientId: null }, supabase);
}

/**
 * MCP bot path — service-role with x-mowa-bot-id (R-PERM-03).
 * Requires a branded {@link BotRepoIdentity} minted by BE-04 auth (plain objects rejected).
 * Owner–bot pair DB lookup remains BE-04.
 */
export function forBot(identity: BotRepoIdentity): RepoClient {
	if (!isBotRepoIdentity(identity)) {
		throw new Error(
			'[R-PERM-03] forBot requires a branded BotRepoIdentity from mcp/auth (BE-04)'
		);
	}
	const { ownerId, botClientId } = identity;
	const db = createSupabaseAdminClient({
		headers: { 'x-mowa-bot-id': botClientId }
	});
	return bindDb({ kind: 'bot', ownerId, botClientId }, db);
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

const STATIC_STRIP = [
	'owner_id',
	'source_bot_id',
	'display_no',
	'display_id',
	'id',
	'version',
	'approval_version',
	'archived_at',
	'created_at',
	'updated_at',
	// M-2 / PR #7 naming — never accept client proposer fields
	'proposer_type',
	'proposed_by_bot_id',
	'proposed_by_user_id'
] as const;

/**
 * Strip client-supplied identity / system fields before insert/update.
 * Removes all `proposed_by*` plus `proposer_type` / bot_id aliases (M-2).
 */
export function stripClientIdentity<T extends Record<string, unknown>>(
	row: T
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(row)) {
		if (key.startsWith('proposed_by')) continue;
		if ((STATIC_STRIP as readonly string[]).includes(key)) continue;
		out[key] = value;
	}
	return out;
}
