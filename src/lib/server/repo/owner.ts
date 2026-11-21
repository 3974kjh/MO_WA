/**
 * Every repository query must force an owner_id filter (R-SYS-01).
 */
import type { RepoClient } from './client';

export class OwnerScopeError extends Error {
	constructor(message = '[R-SYS-01] owner_id filter is required') {
		super(message);
		this.name = 'OwnerScopeError';
	}
}

export function requireOwnerId(repo: RepoClient): string {
	const id = repo.actor.ownerId;
	if (!id) throw new OwnerScopeError();
	return id;
}

/**
 * Apply `.eq('owner_id', ownerId)` — call on every select/update/delete builder.
 * Create paths use serverCreateStamps instead.
 */
export function withOwnerFilter<T extends { eq: (col: string, val: string) => T }>(
	query: T,
	ownerId: string
): T {
	if (!ownerId) throw new OwnerScopeError();
	return query.eq('owner_id', ownerId);
}
