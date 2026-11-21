/**
 * MCP auth (BE-04).
 *
 * After a successful `mcp_authenticate`, this module calls
 * `mintBotRepoIdentity` from `repo/botIdentityBrand` and passes the frozen
 * identity to `forBot`. Mint is intentionally **not** re-exported — callers
 * outside auth must not construct BotRepoIdentity.
 *
 * The client request header `x-mowa-bot-id` is never read (BE-04-H). Trigger
 * identity comes only from the authenticated bot_client_id after mint/forBot.
 */
export type { BotRepoIdentity } from '../repo/botIdentityBrand';
export type { McpContext } from './types';

import { mintBotRepoIdentity } from '../repo/botIdentityBrand';
import { forBot, type RepoClient } from '$lib/server/repo';
import { hmacSha256Hex, timingSafeEqualHex } from '$lib/server/crypto';
import type { McpContext } from './types';

/** mowa_<prefix 10자 [a-z0-9]>_<secret 43자 base64url(32B)> */
const KEY_RE = /^mowa_([a-z0-9]{10})_([A-Za-z0-9_-]{43})$/;

export type AuthEnv = {
	MCP_KEY_PEPPER?: string;
	MCP_AUTH_MODE?: string; // 'env'(스파이크 1단계) | 'db'(2단계: mcp_authenticate RPC)
	MCP_SPIKE_KEY_PREFIX?: string;
	MCP_SPIKE_KEY_HASH?: string;
};

export type AuthSuccess = {
	ok: true;
	ctx: McpContext;
	/** Bot-scoped repo client after mint; null in env mode. */
	repo: RepoClient | null;
};

export type AuthFailure =
	| { ok: false; status: 401 | 500; reason: string }
	| {
			ok: false;
			status: 429;
			reason: 'rate_limited';
			retryAfter: number;
			/** Known bot after RPC; used for audit rate_limited. */
			ctx: McpContext;
	  };

export type AuthResult = AuthSuccess | AuthFailure;

export function parseBearer(header: string | null): { prefix: string; secret: string } | null {
	const m = /^Bearer\s+(\S+)$/i.exec(header ?? '');
	if (!m) return null;
	const k = KEY_RE.exec(m[1]);
	return k ? { prefix: k[1], secret: k[2] } : null;
}

type McpAuthRow = {
	bot_client_id: string;
	owner_id: string;
	bot_name: string;
	profile: string;
	scopes: string[] | null;
	allowed: boolean;
	retry_after_s: number | null;
};

function ctxFromDbRow(row: McpAuthRow): McpContext {
	return {
		botClientId: String(row.bot_client_id),
		ownerId: String(row.owner_id),
		botName: String(row.bot_name),
		profile: String(row.profile ?? 'custom'),
		scopes: Object.freeze([...(row.scopes ?? [])]),
		mode: 'db'
	};
}

/**
 * Authenticate an MCP request.
 * Never consults `x-mowa-bot-id` from the client (spoofing cannot change identity).
 */
export async function authenticate(request: Request, env: AuthEnv): Promise<AuthResult> {
	const key = parseBearer(request.headers.get('authorization'));
	if (!key) return { ok: false, status: 401, reason: 'missing_or_malformed_key' };
	if (!env.MCP_KEY_PEPPER) return { ok: false, status: 500, reason: 'server_misconfigured' };

	const hash = await hmacSha256Hex(env.MCP_KEY_PEPPER, key.secret);

	if ((env.MCP_AUTH_MODE ?? 'env') === 'env') {
		const okPrefix = key.prefix === (env.MCP_SPIKE_KEY_PREFIX ?? '');
		const okHash = timingSafeEqualHex(hash, (env.MCP_SPIKE_KEY_HASH ?? '').toLowerCase());
		if (!(okPrefix && okHash)) return { ok: false, status: 401, reason: 'invalid_key' };
		return {
			ok: true,
			repo: null,
			ctx: {
				botClientId: `env:${key.prefix}`,
				ownerId: null,
				botName: 'spike',
				profile: 'custom',
				scopes: Object.freeze(['read']),
				mode: 'env'
			}
		};
	}

	// DB mode: mcp_authenticate RPC (service_role). Malformed keys never reach here.
	const { createSupabaseAdminClient } = await import('$lib/supabase/admin');
	const admin = createSupabaseAdminClient();
	const ip = request.headers.get('cf-connecting-ip');
	const { data, error } = await admin.rpc('mcp_authenticate', {
		p_prefix: key.prefix,
		p_hash: hash,
		p_ip: ip
	});
	if (error) return { ok: false, status: 500, reason: 'auth_backend_error' };
	const row = (Array.isArray(data) ? data[0] : null) as McpAuthRow | null | undefined;
	if (!row) return { ok: false, status: 401, reason: 'invalid_key' };

	const ctx = ctxFromDbRow(row);
	if (!row.allowed) {
		return {
			ok: false,
			status: 429,
			reason: 'rate_limited',
			retryAfter: Number(row.retry_after_s) || 60,
			ctx
		};
	}

	const identity = mintBotRepoIdentity(ctx.ownerId!, ctx.botClientId);
	const repo = forBot(identity);
	return { ok: true, ctx, repo };
}
