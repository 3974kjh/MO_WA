/**
 * Module-internal RepoClient ↔ Supabase binding (M-4).
 * Not exported from `$lib/server/repo` index. Do not import outside `repo/*`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';
import { fromTable } from './supabaseTable';

/** Opaque repo handle — structural match for RepoClient without importing client.ts. */
type RepoHandle = object;

const dbByRepo = new WeakMap<RepoHandle, SupabaseClient<Database>>();

export function bindRepoDb(repo: RepoHandle, db: SupabaseClient<Database>): void {
	dbByRepo.set(repo, db);
}

function requireBoundDb(repo: RepoHandle): SupabaseClient<Database> {
	const db = dbByRepo.get(repo);
	if (!db) throw new Error('[R-SYS-01] invalid RepoClient (no bound database)');
	return db;
}

/** Table accessor bound to a RepoClient. */
export function fromRepo(repo: RepoHandle, table: string) {
	return fromTable(requireBoundDb(repo), table);
}
