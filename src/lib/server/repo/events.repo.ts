import type { Database } from '$lib/types/database.types';
import { archiveRow, restoreRow } from './archive';
import { serverCreateStamps, stripClientIdentity, type RepoClient } from './client';
import { clientRefConflictFromInsertError, resolveClientRefConflict } from './clientRef';
import { fromRepo } from './db';
import { requireOwnerId, withOwnerFilter } from './owner';
import { EVENT_PATCHABLE, pickPatchable } from './patch';

export type EventRow = Database['public']['Tables']['events']['Row'];
export type EventCreateInput = Partial<EventRow> &
	Pick<EventRow, 'event_date' | 'title' | 'domain' | 'kind'>;

export async function listEvents(
	repo: RepoClient,
	opts: {
		from?: string;
		to?: string;
		domain?: string;
		includeArchived?: boolean;
		limit?: number;
	} = {}
): Promise<{ data: EventRow[]; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'events').select('*');
	q = withOwnerFilter(q, ownerId);
	if (!opts.includeArchived) q = q.is('archived_at', null);
	if (opts.domain) q = q.eq('domain', opts.domain);
	if (opts.from) q = q.gte('event_date', opts.from);
	if (opts.to) q = q.lte('event_date', opts.to);
	q = q.order('event_date', { ascending: true });
	if (opts.limit) q = q.limit(opts.limit);
	const { data, error } = await q;
	return { data: (data ?? []) as EventRow[], error: error as Error | null };
}

export async function getEventById(
	repo: RepoClient,
	id: string
): Promise<{ data: EventRow | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'events').select('*').eq('id', id);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.maybeSingle();
	return { data: (data as EventRow | null) ?? null, error: error as Error | null };
}

/** R-PERM-11: same client_ref + same content → existing row; different content → CONFLICT. */
export async function createEvent(
	repo: RepoClient,
	input: EventCreateInput
): Promise<{ data: EventRow | null; error: Error | null }> {
	const stamps = serverCreateStamps(repo.actor);
	const row: Record<string, unknown> = {
		...stripClientIdentity(input as Record<string, unknown>, 'events'),
		...stamps
	};
	const { data, error } = await fromRepo(repo, 'events').insert(row).select('*').single();
	if (!error) return { data: (data as EventRow | null) ?? null, error: null };
	const clientRef = typeof row.client_ref === 'string' ? row.client_ref : null;
	if (clientRef && clientRefConflictFromInsertError(error)) {
		return resolveClientRefConflict<EventRow>(repo, 'events', clientRef, row);
	}
	return { data: null, error: error as Error };
}

export async function updateEvent(
	repo: RepoClient,
	id: string,
	patch: Partial<EventRow>
): Promise<{ data: EventRow | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	const safe = pickPatchable(patch as Record<string, unknown>, EVENT_PATCHABLE);
	let q = fromRepo(repo, 'events').update(safe).eq('id', id);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.select('*').single();
	return { data: (data as EventRow | null) ?? null, error: error as Error | null };
}

export function archiveEvent(repo: RepoClient, id: string) {
	return archiveRow(repo, 'events', id);
}

export function restoreEvent(repo: RepoClient, id: string) {
	return restoreRow(repo, 'events', id);
}
