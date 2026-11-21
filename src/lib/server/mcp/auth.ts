/**
 * MCP auth (BE-04).
 *
 * After a successful `mcp_authenticate`, this module will call
 * `mintBotRepoIdentity` from `repo/botIdentityBrand` and pass the frozen
 * identity to `forBot`. Mint is intentionally **not** re-exported — callers
 * outside auth must not construct BotRepoIdentity.
 */
export type { BotRepoIdentity } from '../repo/botIdentityBrand';

// BE-04 will import mintBotRepoIdentity here only (not re-export):
// import { mintBotRepoIdentity } from '../repo/botIdentityBrand';

import { hmacSha256Hex, timingSafeEqualHex } from '$lib/server/crypto';

/** mowa_<prefix 10자 [a-z0-9]>_<secret 43자 base64url(32B)> */
const KEY_RE = /^mowa_([a-z0-9]{10})_([A-Za-z0-9_-]{43})$/;

export type McpContext = {
	botClientId: string;
	ownerId: string | null;
	botName: string;
	scopes: string[];
	mode: 'env' | 'db';
};

export type AuthEnv = {
	MCP_KEY_PEPPER?: string;
	MCP_AUTH_MODE?: string; // 'env'(스파이크 1단계) | 'db'(2단계: mcp_authenticate RPC)
	MCP_SPIKE_KEY_PREFIX?: string;
	MCP_SPIKE_KEY_HASH?: string;
};

export type AuthResult =
	| { ok: true; ctx: McpContext }
	| { ok: false; status: 401 | 429 | 500; reason: string; retryAfter?: number };

export function parseBearer(header: string | null): { prefix: string; secret: string } | null {
	const m = /^Bearer\s+(\S+)$/i.exec(header ?? '');
	if (!m) return null;
	const k = KEY_RE.exec(m[1]);
	return k ? { prefix: k[1], secret: k[2] } : null;
}

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
			ctx: {
				botClientId: `env:${key.prefix}`,
				ownerId: null,
				botName: 'spike',
				scopes: ['read'],
				mode: 'env'
			}
		};
	}

	// 2단계(DB): migrations-draft 08의 mcp_authenticate RPC. 스테이징 Supabase 승인 후 활성화.
	const { createSupabaseAdminClient } = await import('$lib/supabase/admin');
	const admin = createSupabaseAdminClient();
	const ip = request.headers.get('cf-connecting-ip');
	// @ts-expect-error: RPC 타입은 db:types 재생성 후 생긴다
	const { data, error } = await admin.rpc('mcp_authenticate', {
		p_prefix: key.prefix,
		p_hash: hash,
		p_ip: ip
	});
	if (error) return { ok: false, status: 500, reason: 'auth_backend_error' };
	const row = (data as Array<Record<string, unknown>> | null)?.[0];
	if (!row) return { ok: false, status: 401, reason: 'invalid_key' };
	if (!row.allowed)
		return { ok: false, status: 429, reason: 'rate_limited', retryAfter: Number(row.retry_after_s) || 60 };
	return {
		ok: true,
		ctx: {
			botClientId: String(row.bot_client_id),
			ownerId: String(row.owner_id),
			botName: String(row.bot_name),
			scopes: (row.scopes as string[]) ?? [],
			mode: 'db'
		}
	};
}
