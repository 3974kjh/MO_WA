/**
 * Repository clients (design §1 / §2).
 * Bot path: service-role + owner_id forced + x-mowa-bot-id (R-SYS-01, R-PERM-03).
 * User path: session Supabase client (RLS).
 *
 * ## Call boundary (M-5)
 * Repo create/update must **not** call `runRules`. Validation runs in MCP tools
 * (BE-06+) and web form/RPC. Mode: general key → `strict`; `import:all` → `migration`.
 *
 * `createSupabaseAdminClient` / `$lib/supabase/admin` may only be imported from repo (and mcp/auth).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '$lib/supabase/admin';
import type { Database } from '$lib/types/database.types';

/**
 * M-4: BE-04 will verify the owner–bot pair via `mcp_authenticate`.
 * This PR only accepts structured identity (blocks bare string / loose bypasses).
 * Owner–bot pair DB lookup is intentionally out of scope here.
 */
export type BotRepoIdentity = {
	readonly ownerId: string;
	readonly botClientId: string;
};

export type RepoActor =
	| { kind: 'user'; ownerId: string; botClientId: null }
	| { kind: 'bot'; ownerId: string; botClientId: string };

/** Internal symbol — do not re-export from repo/index (keeps db private, M-4). */
export const REPO_DB = Symbol('mowa.repo.db');

export type RepoClient = {
	readonly actor: RepoActor;
	readonly [REPO_DB]: SupabaseClient<Database>;
};

export function getRepoDb(repo: RepoClient): SupabaseClient<Database> {
	return repo[REPO_DB];
}

/** Web session path — RLS enforces owner; still stamp owner_id on writes. */
export function forUser(supabase: SupabaseClient<Database>, ownerId: string): RepoClient {
	if (!ownerId) throw new Error('[R-SYS-01] ownerId is required');
	return {
		actor: { kind: 'user', ownerId, botClientId: null },
		[REPO_DB]: supabase
	};
}

/**
 * MCP bot path — service-role with x-mowa-bot-id header (R-PERM-03).
 * Pass {@link BotRepoIdentity} only (M-4). Pair verification = BE-04.
 */
export function forBot(identity: BotRepoIdentity): RepoClient {
	const { ownerId, botClientId } = identity;
	if (!ownerId) throw new Error('[R-SYS-01] ownerId is required');
	if (!botClientId) throw new Error('[R-PERM-03] botClientId is required');

	const db = createSupabaseAdminClient({
		headers: { 'x-mowa-bot-id': botClientId }
	});

	return {
		actor: { kind: 'bot', ownerId, botClientId },
		[REPO_DB]: db
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
	'updated_at'
] as const;

/**
 * Strip client-supplied identity / system fields before insert/update.
 * M-2: remove all `proposed_by*` (incl. `proposed_by_user` / `proposed_by_user_id`).
 * M-3: also strip id/version/approval_version/archived_at/created_at/updated_at.
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
