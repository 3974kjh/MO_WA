/**
 * Module-internal RepoClient ↔ Supabase binding (M-4).
 * Not exported from `$lib/server/repo` index. Do not import outside `repo/*`.
 *
 * `fromRepo` forces `.eq('owner_id', …)` on select/update/delete for owner-scoped
 * tables. Tables without owner_id are listed explicitly and left unscoped.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';
import { fromTable } from './supabaseTable';

/** Opaque repo handle — needs actor.ownerId for owner-scoped accessors. */
export type RepoHandle = {
	readonly actor: { readonly ownerId: string };
};

const dbByRepo = new WeakMap<RepoHandle, SupabaseClient<Database>>();

/**
 * Tables with no owner_id column — do not auto-filter.
 * Keep this set narrow and explicit.
 */
const TABLES_WITHOUT_OWNER = new Set([
	'market_indicator_keys'
]);

export function bindRepoDb(repo: RepoHandle, db: SupabaseClient<Database>): void {
	if (dbByRepo.has(repo)) {
		throw new Error('[R-SYS-01] RepoClient is already bound to a database');
	}
	dbByRepo.set(repo, db);
}

function requireBoundDb(repo: RepoHandle): SupabaseClient<Database> {
	const db = dbByRepo.get(repo);
	if (!db) throw new Error('[R-SYS-01] invalid RepoClient (no bound database)');
	return db;
}

type EqBuilder = {
	eq: (col: string, val: string) => EqBuilder;
	[key: string]: unknown;
};

/**
 * After select/update/delete, immediately force owner_id.
 * insert / upsert are left alone (create paths stamp owner_id).
 */
function withForcedOwner(builder: EqBuilder, ownerId: string): EqBuilder {
	const force = new Set(['select', 'update', 'delete']);
	return new Proxy(builder, {
		get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver);
			if (typeof prop === 'string' && force.has(prop) && typeof value === 'function') {
				return (...args: unknown[]) => {
					const next = (value as (...a: unknown[]) => EqBuilder).apply(target, args);
					return next.eq('owner_id', ownerId);
				};
			}
			if (typeof value === 'function') {
				return value.bind(target);
			}
			return value;
		}
	});
}

/** Table accessor bound to a RepoClient — owner_id forced when the table has one. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromRepo(repo: RepoHandle, table: string): any {
	const base = fromTable(requireBoundDb(repo), table) as unknown as EqBuilder;
	if (TABLES_WITHOUT_OWNER.has(table)) {
		return base;
	}
	const ownerId = repo.actor.ownerId;
	if (!ownerId) {
		throw new Error('[R-SYS-01] owner_id filter is required');
	}
	return withForcedOwner(base, ownerId);
}
