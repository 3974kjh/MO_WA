/**
 * Repository clients (design §1 / §2).
 *
 * M-4: Supabase client is stored only in a module-internal WeakMap (`db.ts`) —
 * never on the RepoClient object. BotRepoIdentity authenticity is a WeakSet
 * (see botIdentityBrand). Import this file only from other repo modules
 * (ESLint blocks direct imports of repo/client outside repo).
 *
 * M-5: Repo create/update must not call runRules.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '$lib/supabase/admin';
import type { Database } from '$lib/types/database.types';
import { isBotRepoIdentity, type BotRepoIdentity } from './botIdentityBrand';
import { bindRepoDb } from './db';

export type { BotRepoIdentity };

export type RepoActor =
	| { readonly kind: 'user'; readonly ownerId: string; readonly botClientId: null }
	| { readonly kind: 'bot'; readonly ownerId: string; readonly botClientId: string };

/** Opaque handle — no db field. */
export type RepoClient = {
	readonly actor: RepoActor;
};

/** Tables that may be passed to stripClientIdentity / compare helpers. */
export type StripTable =
	| 'reports'
	| 'positions'
	| 'journal_entries'
	| 'instruments'
	| 'position_proposals'
	| 'principle_proposals'
	| 'decisions'
	| 'events';

function freezeRepo(actor: RepoActor, db: SupabaseClient<Database>): RepoClient {
	const frozenActor = Object.freeze({ ...actor });
	const repo = Object.freeze({ actor: frozenActor }) as RepoClient;
	bindRepoDb(repo, db);
	return repo;
}

/** Web session path — RLS enforces owner; still stamp owner_id on writes. */
export function forUser(supabase: SupabaseClient<Database>, ownerId: string): RepoClient {
	if (!ownerId) throw new Error('[R-SYS-01] ownerId is required');
	return freezeRepo({ kind: 'user', ownerId, botClientId: null }, supabase);
}

/**
 * MCP bot path — service-role with x-mowa-bot-id (R-PERM-03).
 * Requires a WeakSet-minted {@link BotRepoIdentity} from BE-04 auth.
 * Copies identity values; freezes actor + RepoClient.
 */
export function forBot(identity: BotRepoIdentity): RepoClient {
	if (!isBotRepoIdentity(identity)) {
		throw new Error('[R-PERM-03] forBot requires a minted BotRepoIdentity from mcp/auth (BE-04)');
	}
	const ownerId = identity.ownerId;
	const botClientId = identity.botClientId;
	const db = createSupabaseAdminClient({
		headers: { 'x-mowa-bot-id': botClientId }
	});
	return freezeRepo({ kind: 'bot', ownerId, botClientId }, db);
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

/**
 * Server-owned columns common to all tables — never accept from the client.
 * Note: `status` is NOT here — it is a domain field on positions/reports.
 */
export const SERVER_FILLED_COMMON = [
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
	'proposed_by_user_id',
	'proposed_by_type',
	'proposed_by',
	'proposed_by_user'
] as const;

/**
 * Proposal-queue server fields — strip only for position_proposals /
 * principle_proposals. Do NOT strip from positions or reports.
 */
export const SERVER_FILLED_PROPOSAL_ONLY = [
	'status',
	'expires_at',
	'decided_at',
	'acknowledged_at',
	'attention_started_at'
] as const;

const PROPOSAL_TABLES = new Set<StripTable>(['position_proposals', 'principle_proposals']);

/** Dangerous own-keys that must never be copied from client payloads. */
const DANGEROUS_OWN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function serverFilledKeysForTable(table: StripTable): readonly string[] {
	if (PROPOSAL_TABLES.has(table)) {
		return [...SERVER_FILLED_COMMON, ...SERVER_FILLED_PROPOSAL_ONLY];
	}
	return [...SERVER_FILLED_COMMON];
}

function assignOwn(out: Record<string, unknown>, key: string, value: unknown): void {
	Object.defineProperty(out, key, {
		value,
		enumerable: true,
		writable: true,
		configurable: true
	});
}

/**
 * Strip client-supplied identity / system fields before insert/update.
 * `table` is required so proposal-only keys (status, expires_at, …) cannot leak
 * when a call site forgets to pass the table.
 * Result is a null-prototype object; `__proto__` / `constructor` / `prototype` are dropped.
 */
export function stripClientIdentity<T extends Record<string, unknown>>(
	row: T,
	table: StripTable
): Record<string, unknown> {
	const block = new Set(serverFilledKeysForTable(table));
	const out: Record<string, unknown> = Object.create(null);
	for (const [key, value] of Object.entries(row)) {
		if (DANGEROUS_OWN_KEYS.has(key)) continue;
		if (key.startsWith('proposed_by')) continue;
		if (block.has(key)) continue;
		assignOwn(out, key, value);
	}
	return out;
}
