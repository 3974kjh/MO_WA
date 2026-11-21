/**
 * Module-internal RepoClient ↔ Supabase binding (M-4).
 * Not exported from `$lib/server/repo` index. Do not import outside `repo/*`.
 *
 * `fromRepo` forces owner_id on select/update/delete filters and on
 * insert/upsert payloads. Tables without owner_id are listed explicitly.
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
 * Tables with no owner_id column — do not auto-filter / stamp.
 * Keep this set narrow and explicit.
 */
const TABLES_WITHOUT_OWNER = new Set(['market_indicator_keys']);

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

/** Stamp owner_id onto insert/upsert rows; throw on mismatched owner_id. */
export function stampOwnerOnPayload(payload: unknown, ownerId: string): unknown {
	if (Array.isArray(payload)) {
		return payload.map((row) => stampOwnerOnRow(row, ownerId));
	}
	return stampOwnerOnRow(payload, ownerId);
}

function stampOwnerOnRow(row: unknown, ownerId: string): unknown {
	if (!row || typeof row !== 'object') return row;
	const r = row as Record<string, unknown>;
	if ('owner_id' in r && r.owner_id != null && r.owner_id !== '' && r.owner_id !== ownerId) {
		throw new Error("[R-SYS-01] owner_id mismatch: cannot write another owner's row");
	}
	return { ...r, owner_id: ownerId };
}

/**
 * Force owner_id:
 * - select / update / delete → `.eq('owner_id', ownerId)`
 * - insert / upsert → stamp payload (throw if conflicting owner_id)
 */
function withForcedOwner(builder: EqBuilder, ownerId: string): EqBuilder {
	const filterOps = new Set(['select', 'update', 'delete']);
	const writeOps = new Set(['insert', 'upsert']);
	return new Proxy(builder, {
		get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver);
			if (typeof prop === 'string' && filterOps.has(prop) && typeof value === 'function') {
				return (...args: unknown[]) => {
					const next = (value as (...a: unknown[]) => EqBuilder).apply(target, args);
					return next.eq('owner_id', ownerId);
				};
			}
			if (typeof prop === 'string' && writeOps.has(prop) && typeof value === 'function') {
				return (payload: unknown, ...rest: unknown[]) => {
					const stamped = stampOwnerOnPayload(payload, ownerId);
					return (value as (...a: unknown[]) => EqBuilder).apply(target, [stamped, ...rest]);
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
