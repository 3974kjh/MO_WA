/**
 * BE-12 bot_clients list / issue RPC / revoke·expiry·rate updates.
 * Select never requests key_hash (RLS also withholds it).
 */
import type { RepoClient } from './client';
import { fromRepo, rpcFromRepo } from './db';
import { requireOwnerId, withOwnerFilter } from './owner';

/** Public bot_clients columns — never includes key_hash. */
export const BOT_CLIENT_PUBLIC_COLUMNS =
	'id, owner_id, name, profile, description, key_prefix, scopes, rate_limit_per_min, expires_at, revoked_at, revoked_reason, last_used_at, created_at, updated_at' as const;

export type BotClientPublic = {
	id: string;
	owner_id: string;
	name: string;
	profile: string;
	description: string | null;
	key_prefix: string;
	scopes: string[];
	rate_limit_per_min: number;
	expires_at: string | null;
	revoked_at: string | null;
	revoked_reason: string | null;
	last_used_at: string | null;
	created_at: string;
	updated_at: string;
};

export async function listBotClients(
	repo: RepoClient
): Promise<{ data: BotClientPublic[]; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'bot_clients').select(BOT_CLIENT_PUBLIC_COLUMNS).order('created_at', {
		ascending: false
	});
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	if (error) return { data: [], error: error as Error };
	return { data: (data ?? []) as BotClientPublic[], error: null };
}

export type IssueBotClientArgs = {
	name: string;
	profile: string;
	keyPrefix: string;
	keyHash: string;
	scopes: string[];
	description?: string | null;
	rateLimitPerMin?: number;
	expiresAt?: string | null;
};

type RpcError = Error & { code?: string; details?: string; hint?: string; constraint?: string };

function mapRpcError(error: {
	message: string;
	code?: string;
	details?: string;
	hint?: string;
}): RpcError {
	const err = new Error(error.message) as RpcError;
	err.code = error.code;
	err.details = error.details;
	err.hint = error.hint;
	return err;
}

export async function issueBotClientRpc(
	repo: RepoClient,
	args: IssueBotClientArgs
): Promise<{ data: BotClientPublic | null; error: Error | null }> {
	if (repo.actor.kind !== 'user') {
		return { data: null, error: new Error('[R-PERM-05] issue requires a user session') };
	}
	const result = await rpcFromRepo(repo, 'issue_bot_client', {
		p_name: args.name,
		p_profile: args.profile,
		p_key_prefix: args.keyPrefix,
		p_key_hash: args.keyHash,
		p_scopes: args.scopes,
		p_description: args.description ?? null,
		p_rate_limit_per_min: args.rateLimitPerMin ?? 60,
		p_expires_at: args.expiresAt ?? null
	});
	if (result.error) {
		return { data: null, error: mapRpcError(result.error) };
	}
	const row = Array.isArray(result.data) ? result.data[0] : result.data;
	return { data: (row as BotClientPublic | null) ?? null, error: null };
}

export async function revokeBotClient(
	repo: RepoClient,
	args: { id: string; reason?: string | null }
): Promise<{ data: BotClientPublic | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'bot_clients')
		.update({
			revoked_at: new Date().toISOString(),
			revoked_reason: args.reason ?? 'revoked'
		})
		.eq('id', args.id)
		.is('revoked_at', null)
		.select(BOT_CLIENT_PUBLIC_COLUMNS)
		.maybeSingle();
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	if (error) return { data: null, error: error as Error };
	return { data: (data as BotClientPublic | null) ?? null, error: null };
}

export async function setBotClientExpiry(
	repo: RepoClient,
	args: { id: string; expiresAt: string | null }
): Promise<{ data: BotClientPublic | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'bot_clients')
		.update({ expires_at: args.expiresAt })
		.eq('id', args.id)
		.select(BOT_CLIENT_PUBLIC_COLUMNS)
		.maybeSingle();
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	if (error) return { data: null, error: error as Error };
	return { data: (data as BotClientPublic | null) ?? null, error: null };
}

export async function setBotClientRateLimit(
	repo: RepoClient,
	args: { id: string; rateLimitPerMin: number }
): Promise<{ data: BotClientPublic | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'bot_clients')
		.update({ rate_limit_per_min: args.rateLimitPerMin })
		.eq('id', args.id)
		.select(BOT_CLIENT_PUBLIC_COLUMNS)
		.maybeSingle();
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q;
	if (error) return { data: null, error: error as Error };
	return { data: (data as BotClientPublic | null) ?? null, error: null };
}

/**
 * Server-side read of one key's `created_at` (feed warm-up gate, R-FEED-40).
 * `botClientId` must come from the authenticated context, never from client input. Owner-scoped via
 * the repo; no key_hash is selected. Returns null data when the row is missing.
 */
export async function getBotClientCreatedAt(
	repo: RepoClient,
	botClientId: string
): Promise<{ data: string | null; error: Error | null }> {
	const ownerId = requireOwnerId(repo);
	let q = fromRepo(repo, 'bot_clients').select('id, created_at').eq('id', botClientId);
	q = withOwnerFilter(q, ownerId);
	const { data, error } = await q.maybeSingle();
	if (error) return { data: null, error: error as Error };
	const createdAt = (data as { created_at?: unknown } | null)?.created_at;
	return { data: typeof createdAt === 'string' ? createdAt : null, error: null };
}
