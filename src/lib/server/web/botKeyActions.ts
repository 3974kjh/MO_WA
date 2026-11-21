/**
 * BE-12 settings bot-key form actions (issue / revoke / setExpiry / setRateLimit).
 *
 * - Plaintext API key is returned only from the issue success body (`apiKey`).
 * - Persist prefix + key_hash only (HMAC via existing hmacSha256Hex + MCP_KEY_PEPPER).
 * - Never log apiKey / secret / key_hash.
 */
import { fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateBotApiKey, hmacSha256Hex } from '$lib/server/crypto';
import {
	defaultScopesForProfile,
	isBotProfile,
	scopesRequireFinanceManager,
	type BotProfile
} from '$lib/server/mcp/botProfiles';
import {
	forUser,
	issueBotClientRpc,
	listBotClients,
	revokeBotClient,
	setBotClientExpiry,
	setBotClientRateLimit,
	type BotClientPublic
} from '$lib/server/repo';
import type { Database } from '$lib/types/database.types';
import { failFromDbError, failValidation } from './actionErrors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISSUE_PREFIX_RETRIES = 5;

function formString(form: FormData, key: string): string {
	const v = form.get(key);
	return typeof v === 'string' ? v.trim() : '';
}

function parseOptionalIso(raw: string): string | null | { error: string } {
	if (raw === '') return null;
	const t = Date.parse(raw);
	if (Number.isNaN(t)) return { error: 'expires_at must be a valid ISO datetime' };
	return new Date(t).toISOString();
}

function parseRateLimit(raw: string): number | { error: string } {
	if (raw === '') return 60;
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1 || n > 600) {
		return { error: 'rate_limit_per_min must be an integer between 1 and 600' };
	}
	return n;
}

function parseScopesOverride(
	raw: string,
	profile: BotProfile
): { ok: true; scopes: string[] } | { ok: false; message: string; ruleId: string } {
	if (raw === '') {
		return { ok: true, scopes: defaultScopesForProfile(profile) };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw) as unknown;
	} catch {
		return { ok: false, ruleId: 'R-PERM-10', message: 'scopes must be a JSON string array' };
	}
	if (!Array.isArray(parsed) || !parsed.every((s) => typeof s === 'string' && s.length > 0)) {
		return { ok: false, ruleId: 'R-PERM-10', message: 'scopes must be a JSON string array' };
	}
	const scopes = parsed as string[];
	if (scopesRequireFinanceManager(scopes) && profile !== 'finance-manager') {
		return {
			ok: false,
			ruleId: 'R-PERM-10',
			message: '[R-PERM-10] positions:propose and principles:propose require finance-manager'
		};
	}
	return { ok: true, scopes };
}

export type IssueSuccess = {
	ok: true;
	/** One-time plaintext key — never returned from load/list. */
	apiKey: string;
	botClient: BotClientPublic;
};

export type IssueActionOpts = {
	/** Set on the one-time apiKey success response so caches do not store the plaintext. */
	setHeaders?: (headers: Record<string, string>) => void;
};

export async function handleIssueBotKey(
	supabase: SupabaseClient<Database>,
	ownerId: string,
	form: FormData,
	opts: IssueActionOpts = {}
) {
	const pepper = env.MCP_KEY_PEPPER;
	if (!pepper) {
		return fail(500, {
			ok: false as const,
			message: 'server_misconfigured',
			ruleIds: [] as string[],
			code: 'server_misconfigured'
		});
	}

	const name = formString(form, 'name');
	const profileRaw = formString(form, 'profile');
	const description = formString(form, 'description') || null;
	const expiresRaw = formString(form, 'expires_at');
	const rateRaw = formString(form, 'rate_limit_per_min');
	const scopesRaw = formString(form, 'scopes');

	if (!name) {
		return failValidation(400, 'R-PERM-10', 'name is required');
	}
	if (!isBotProfile(profileRaw)) {
		return failValidation(400, 'R-PERM-10', 'profile is invalid');
	}
	const profile = profileRaw;

	const expiresParsed = parseOptionalIso(expiresRaw);
	if (expiresParsed && typeof expiresParsed === 'object' && 'error' in expiresParsed) {
		return failValidation(400, 'R-PERM-10', expiresParsed.error);
	}
	const expiresAt = expiresParsed as string | null;

	if (profile === 'importer' && expiresAt == null) {
		return failValidation(
			400,
			'R-PERM-10',
			'[R-PERM-10] importer keys require an expiry date (expires_at)'
		);
	}

	const rateParsed = parseRateLimit(rateRaw);
	if (typeof rateParsed === 'object') {
		return failValidation(400, 'R-PERM-10', rateParsed.error);
	}

	const scopesResult = parseScopesOverride(scopesRaw, profile);
	if (!scopesResult.ok) {
		return failValidation(400, scopesResult.ruleId, scopesResult.message);
	}

	// Defense in depth: finance-manager defaults already exclude valuations:write / principles:write.
	if (
		profile === 'finance-manager' &&
		(scopesResult.scopes.includes('valuations:write') ||
			scopesResult.scopes.includes('principles:write'))
	) {
		return failValidation(
			400,
			'R-PERM-10',
			'[R-PERM-10] finance-manager must not receive valuations:write or principles:write'
		);
	}

	const repo = forUser(supabase, ownerId);

	for (let attempt = 0; attempt < ISSUE_PREFIX_RETRIES; attempt++) {
		const generated = generateBotApiKey();
		const keyHash = await hmacSha256Hex(pepper, generated.secret);
		const { data, error } = await issueBotClientRpc(repo, {
			name,
			profile,
			keyPrefix: generated.prefix,
			keyHash,
			scopes: scopesResult.scopes,
			description,
			rateLimitPerMin: rateParsed,
			expiresAt
		});
		if (!error && data) {
			// Low-1: never cache the response that carries the one-time plaintext apiKey.
			opts.setHeaders?.({ 'cache-control': 'no-store' });
			const success: IssueSuccess = { ok: true, apiKey: generated.key, botClient: data };
			return success;
		}
		if (error) {
			const msg = error.message ?? '';
			// Unique key_prefix collision — retry with a new CSPRNG prefix.
			if (/key_prefix|bot_clients_key_prefix/i.test(msg) && attempt + 1 < ISSUE_PREFIX_RETRIES) {
				continue;
			}
			return failFromDbError(400, error);
		}
	}

	return fail(500, {
		ok: false as const,
		message: 'could not allocate a unique key prefix',
		ruleIds: [] as string[]
	});
}

export async function handleRevokeBotKey(
	supabase: SupabaseClient<Database>,
	ownerId: string,
	form: FormData
) {
	const id = formString(form, 'id');
	if (!UUID_RE.test(id)) {
		return failValidation(400, 'R-PERM-10', 'id is required');
	}
	const reason = formString(form, 'reason') || 'revoked';
	const repo = forUser(supabase, ownerId);
	const { data, error } = await revokeBotClient(repo, { id, reason });
	if (error) return failFromDbError(400, error);
	if (!data) {
		return fail(404, {
			ok: false as const,
			message: 'bot client not found or already revoked',
			ruleIds: [] as string[]
		});
	}
	return { ok: true as const, botClient: data };
}

export async function handleSetBotKeyExpiry(
	supabase: SupabaseClient<Database>,
	ownerId: string,
	form: FormData
) {
	const id = formString(form, 'id');
	if (!UUID_RE.test(id)) {
		return failValidation(400, 'R-PERM-10', 'id is required');
	}
	const expiresParsed = parseOptionalIso(formString(form, 'expires_at'));
	if (expiresParsed && typeof expiresParsed === 'object' && 'error' in expiresParsed) {
		return failValidation(400, 'R-PERM-10', expiresParsed.error);
	}
	const expiresAt = expiresParsed as string | null;

	const repo = forUser(supabase, ownerId);
	const listed = await listBotClients(repo);
	if (listed.error) return failFromDbError(503, listed.error);
	const existing = listed.data.find((b) => b.id === id);
	if (!existing) {
		return fail(404, {
			ok: false as const,
			message: 'bot client not found',
			ruleIds: [] as string[]
		});
	}
	if (existing.profile === 'importer' && expiresAt == null) {
		return failValidation(
			400,
			'R-PERM-10',
			'[R-PERM-10] importer keys require an expiry date (expires_at)'
		);
	}

	const { data, error } = await setBotClientExpiry(repo, { id, expiresAt });
	if (error) return failFromDbError(400, error);
	if (!data) {
		return fail(404, {
			ok: false as const,
			message: 'bot client not found',
			ruleIds: [] as string[]
		});
	}
	return { ok: true as const, botClient: data };
}

export async function handleSetBotKeyRateLimit(
	supabase: SupabaseClient<Database>,
	ownerId: string,
	form: FormData
) {
	const id = formString(form, 'id');
	if (!UUID_RE.test(id)) {
		return failValidation(400, 'R-PERM-10', 'id is required');
	}
	const rateRaw = formString(form, 'rate_limit_per_min');
	if (rateRaw === '') {
		return failValidation(400, 'R-PERM-10', 'rate_limit_per_min is required');
	}
	const rateParsed = parseRateLimit(rateRaw);
	if (typeof rateParsed === 'object') {
		return failValidation(400, 'R-PERM-10', rateParsed.error);
	}

	const repo = forUser(supabase, ownerId);
	const { data, error } = await setBotClientRateLimit(repo, {
		id,
		rateLimitPerMin: rateParsed
	});
	if (error) return failFromDbError(400, error);
	if (!data) {
		return fail(404, {
			ok: false as const,
			message: 'bot client not found',
			ruleIds: [] as string[]
		});
	}
	return { ok: true as const, botClient: data };
}
