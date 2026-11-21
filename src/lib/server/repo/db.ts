/**
 * Module-internal RepoClient ↔ Supabase binding (M-4).
 * Not exported from `$lib/server/repo` index. Do not import outside `repo/*`.
 *
 * `fromRepo` forces owner_id on select/update/delete filters and on
 * insert/upsert payloads. Upsert also requires onConflict to include owner_id
 * and rejects client-supplied row `id`.
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

type UpsertOptions = {
	onConflict?: string;
	ignoreDuplicates?: boolean;
	count?: string;
	defaultToNull?: boolean;
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
	const out: Record<string, unknown> = Object.create(null);
	for (const [k, v] of Object.entries(r)) {
		Object.defineProperty(out, k, {
			value: v,
			enumerable: true,
			writable: true,
			configurable: true
		});
	}
	Object.defineProperty(out, 'owner_id', {
		value: ownerId,
		enumerable: true,
		writable: true,
		configurable: true
	});
	return out;
}

function payloadHasClientId(payload: unknown): boolean {
	if (Array.isArray(payload)) return payload.some((row) => payloadHasClientId(row));
	if (!payload || typeof payload !== 'object') return false;
	return Object.prototype.hasOwnProperty.call(payload, 'id');
}

/** onConflict must list owner_id (comma/space separated column names). */
export function assertUpsertOnConflictIncludesOwner(options: UpsertOptions | undefined): void {
	const raw = options?.onConflict;
	if (typeof raw !== 'string' || !raw.trim()) {
		throw new Error(
			'[R-SYS-01] upsert requires onConflict including owner_id (owner-scoped unique key)'
		);
	}
	const cols = raw
		.split(/[\s,]+/)
		.map((c) => c.trim())
		.filter(Boolean);
	if (!cols.includes('owner_id')) {
		throw new Error(`[R-SYS-01] upsert onConflict must include owner_id (got "${raw}")`);
	}
}

export function assertUpsertPayloadHasNoId(payload: unknown): void {
	if (payloadHasClientId(payload)) {
		throw new Error('[R-SYS-01] upsert must not include client-supplied id');
	}
}

/**
 * Force owner_id:
 * - select / update / delete → `.eq('owner_id', ownerId)`
 * - insert → stamp payload
 * - upsert → stamp payload + require onConflict with owner_id + reject id
 */
function withForcedOwner(builder: EqBuilder, ownerId: string): EqBuilder {
	const filterOps = new Set(['select', 'update', 'delete']);
	return new Proxy(builder, {
		get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver);
			if (typeof prop === 'string' && filterOps.has(prop) && typeof value === 'function') {
				return (...args: unknown[]) => {
					const next = (value as (...a: unknown[]) => EqBuilder).apply(target, args);
					return next.eq('owner_id', ownerId);
				};
			}
			if (prop === 'insert' && typeof value === 'function') {
				return (payload: unknown, ...rest: unknown[]) => {
					const stamped = stampOwnerOnPayload(payload, ownerId);
					return (value as (...a: unknown[]) => EqBuilder).apply(target, [stamped, ...rest]);
				};
			}
			if (prop === 'upsert' && typeof value === 'function') {
				return (payload: unknown, options?: UpsertOptions, ...rest: unknown[]) => {
					assertUpsertPayloadHasNoId(payload);
					assertUpsertOnConflictIncludesOwner(options);
					const stamped = stampOwnerOnPayload(payload, ownerId);
					return (value as (...a: unknown[]) => EqBuilder).apply(target, [
						stamped,
						options,
						...rest
					]);
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

/**
 * Call a SECURITY DEFINER / authenticated RPC with the repo's bound client (BE-11/BE-19).
 * Prefer this over exporting the raw Supabase client (M-4).
 */
export function rpcFromRepo(
	repo: RepoHandle,
	fn: string,
	args?: Record<string, unknown>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
	const db = requireBoundDb(repo);
	return db.rpc(fn as never, args as never);
}
