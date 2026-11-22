import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	pepper,
	envState,
	issueBotClientRpc,
	revokeBotClient,
	setBotClientExpiry,
	setBotClientRateLimit,
	listBotClients
} = vi.hoisted(() => {
	const pepperValue = 'be12-test-pepper-not-a-secret-for-prod';
	return {
		pepper: pepperValue,
		envState: { MCP_KEY_PEPPER: pepperValue as string | undefined },
		issueBotClientRpc: vi.fn(),
		revokeBotClient: vi.fn(),
		setBotClientExpiry: vi.fn(),
		setBotClientRateLimit: vi.fn(),
		listBotClients: vi.fn()
	};
});

vi.mock('@sveltejs/kit', async () => {
	const actual = await vi.importActual<typeof import('@sveltejs/kit')>('@sveltejs/kit');
	return {
		...actual,
		fail: (status: number, data: unknown) => ({ status, data })
	};
});

vi.mock('$env/dynamic/private', () => ({
	env: envState
}));

vi.mock('$lib/server/repo', () => ({
	forUser: (_sb: unknown, ownerId: string) => ({
		actor: { kind: 'user', ownerId, botClientId: null }
	}),
	issueBotClientRpc,
	revokeBotClient,
	setBotClientExpiry,
	setBotClientRateLimit,
	listBotClients
}));

import { hmacSha256Hex } from '$lib/server/crypto';
import { defaultScopesForProfile } from '$lib/server/mcp/botProfiles';
import {
	handleIssueBotKey,
	handleRevokeBotKey,
	handleSetBotKeyExpiry,
	handleSetBotKeyRateLimit,
	parseOptionalIso
} from './botKeyActions';

const ownerId = '22222222-2222-4222-8222-222222222222';
const botId = '11111111-1111-4111-8111-111111111111';

function publicBot(over: Partial<Record<string, unknown>> = {}) {
	return {
		id: botId,
		owner_id: ownerId,
		name: 'preview-finance-manager',
		profile: 'finance-manager',
		description: null,
		key_prefix: 'abcdefgh12',
		scopes: defaultScopesForProfile('finance-manager'),
		rate_limit_per_min: 60,
		expires_at: null,
		revoked_at: null,
		revoked_reason: null,
		last_used_at: null,
		created_at: '2026-11-21T00:00:00.000Z',
		updated_at: '2026-11-21T00:00:00.000Z',
		...over
	};
}

function fd(entries: Record<string, string>): FormData {
	const f = new FormData();
	for (const [k, v] of Object.entries(entries)) f.set(k, v);
	return f;
}

beforeEach(() => {
	vi.clearAllMocks();
	envState.MCP_KEY_PEPPER = pepper;
});

describe('handleIssueBotKey', () => {
	it('returns plaintext apiKey once and persists only prefix+hash via RPC', async () => {
		const setHeaders = vi.fn();
		issueBotClientRpc.mockImplementation(
			async (_repo: unknown, args: { keyHash: string; keyPrefix: string; scopes: string[] }) => {
				expect(args.keyHash).toMatch(/^[0-9a-f]{64}$/);
				expect(args.keyPrefix).toMatch(/^[a-z0-9]{10}$/);
				// Plaintext must never be an RPC argument.
				expect(JSON.stringify(args)).not.toMatch(/mowa_/);
				return {
					data: publicBot({ key_prefix: args.keyPrefix, scopes: args.scopes }),
					error: null
				};
			}
		);

		const result = await handleIssueBotKey(
			{} as never,
			ownerId,
			fd({
				name: 'preview-finance-manager',
				profile: 'finance-manager'
			}),
			{ setHeaders }
		);

		expect(result).toMatchObject({ ok: true });
		if (!('ok' in result) || !result.ok || !('apiKey' in result)) return;
		expect(result.apiKey).toMatch(/^mowa_[a-z0-9]{10}_[A-Za-z0-9_-]{43}$/);
		expect(result.botClient).not.toHaveProperty('key_hash');
		expect(JSON.stringify(result.botClient)).not.toMatch(/key_hash/);
		expect(setHeaders).toHaveBeenCalledWith({ 'cache-control': 'no-store' });

		const m = /^mowa_[a-z0-9]{10}_([A-Za-z0-9_-]{43})$/.exec(result.apiKey);
		expect(m).toBeTruthy();
		const expectedHash = await hmacSha256Hex(pepper, m![1]!);
		expect(issueBotClientRpc).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ keyHash: expectedHash })
		);
		const scopes = issueBotClientRpc.mock.calls[0]![1].scopes as string[];
		expect(scopes).toContain('reports:equity_analysis');
		expect(scopes).not.toContain('valuations:write');
		expect(scopes).not.toContain('principles:write');
	});

	it('Low-4: missing MCP_KEY_PEPPER → 500 server_misconfigured (fails if guard removed)', async () => {
		envState.MCP_KEY_PEPPER = undefined;
		const setHeaders = vi.fn();
		const result = await handleIssueBotKey(
			{} as never,
			ownerId,
			fd({ name: 'preview-finance-manager', profile: 'finance-manager' }),
			{ setHeaders }
		);
		expect(result).toMatchObject({
			status: 500,
			data: expect.objectContaining({
				ok: false,
				code: 'server_misconfigured',
				message: 'server_misconfigured'
			})
		});
		expect(issueBotClientRpc).not.toHaveBeenCalled();
		expect(setHeaders).not.toHaveBeenCalled();
	});

	it('Low-4: finance-manager + valuations:write is rejected', async () => {
		const result = await handleIssueBotKey(
			{} as never,
			ownerId,
			fd({
				name: 'preview-fm-val',
				profile: 'finance-manager',
				scopes: JSON.stringify(['read', 'reports:equity_analysis', 'valuations:write'])
			})
		);
		expect(result).toMatchObject({
			status: 400,
			data: expect.objectContaining({
				ok: false,
				ruleIds: ['R-PERM-10'],
				message: expect.stringMatching(/valuations:write|principles:write/)
			})
		});
		expect(issueBotClientRpc).not.toHaveBeenCalled();
	});

	it('Low-4: finance-manager + principles:write is rejected', async () => {
		const result = await handleIssueBotKey(
			{} as never,
			ownerId,
			fd({
				name: 'preview-fm-pwrite',
				profile: 'finance-manager',
				scopes: JSON.stringify(['read', 'principles:propose', 'principles:write'])
			})
		);
		expect(result).toMatchObject({
			status: 400,
			data: expect.objectContaining({
				ok: false,
				ruleIds: ['R-PERM-10'],
				message: expect.stringMatching(/valuations:write|principles:write/)
			})
		});
		expect(issueBotClientRpc).not.toHaveBeenCalled();
	});

	it('rejects propose scopes for non-finance-manager profiles', async () => {
		const result = await handleIssueBotKey(
			{} as never,
			ownerId,
			fd({
				name: 'preview-equity',
				profile: 'equity-analyst',
				scopes: JSON.stringify(['read', 'positions:propose'])
			})
		);
		expect(result).toMatchObject({
			status: 400,
			data: expect.objectContaining({ ok: false, ruleIds: ['R-PERM-10'] })
		});
		expect(issueBotClientRpc).not.toHaveBeenCalled();
	});

	it.each(['equity-analyst', 'house-signal', 'custom', 'finance-manager'] as const)(
		'N-3 no-JS: empty scopes with profile=%s → that profile defaults only',
		async (profile) => {
			issueBotClientRpc.mockResolvedValue({ data: publicBot({ profile }), error: null });
			const result = await handleIssueBotKey(
				{} as never,
				ownerId,
				fd({ name: `preview-${profile}`, profile, scopes: '' })
			);
			expect(result).toMatchObject({ ok: true });
			const args = issueBotClientRpc.mock.calls[0]![1] as { scopes: string[] };
			expect(args.scopes).toEqual(defaultScopesForProfile(profile));
			if (profile !== 'finance-manager') {
				expect(args.scopes).not.toContain('positions:propose');
				expect(args.scopes).not.toContain('principles:propose');
			}
		}
	);

	it('N-3: SSR finance-manager scopes posted with another profile are still rejected (no widening)', async () => {
		const result = await handleIssueBotKey(
			{} as never,
			ownerId,
			fd({
				name: 'preview-custom',
				profile: 'custom',
				scopes: JSON.stringify(defaultScopesForProfile('finance-manager'))
			})
		);
		expect(result).toMatchObject({
			status: 400,
			data: expect.objectContaining({ ok: false, ruleIds: ['R-PERM-10'] })
		});
		expect(issueBotClientRpc).not.toHaveBeenCalled();
	});

	it('requires expires_at for importer', async () => {
		const result = await handleIssueBotKey(
			{} as never,
			ownerId,
			fd({ name: 'preview-importer', profile: 'importer' })
		);
		expect(result).toMatchObject({
			status: 400,
			data: expect.objectContaining({ ok: false, ruleIds: ['R-PERM-10'] })
		});
		expect(issueBotClientRpc).not.toHaveBeenCalled();
	});

	it('issues importer when expires_at is set', async () => {
		issueBotClientRpc.mockResolvedValue({
			data: publicBot({
				name: 'preview-importer',
				profile: 'importer',
				scopes: ['import:all'],
				expires_at: '2027-01-01T00:00:00.000Z'
			}),
			error: null
		});
		const result = await handleIssueBotKey(
			{} as never,
			ownerId,
			fd({
				name: 'preview-importer',
				profile: 'importer',
				expires_at: '2027-01-01T00:00:00.000Z'
			})
		);
		expect(result).toMatchObject({ ok: true });
		expect(issueBotClientRpc).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				profile: 'importer',
				scopes: ['import:all'],
				expiresAt: '2027-01-01T00:00:00.000Z'
			})
		);
	});
});

describe('handleRevokeBotKey', () => {
	it('sets revoked_at and returns public row without key_hash', async () => {
		revokeBotClient.mockResolvedValue({
			data: publicBot({ revoked_at: '2026-11-21T12:00:00.000Z', revoked_reason: 'user_revoke' }),
			error: null
		});
		const result = await handleRevokeBotKey(
			{} as never,
			ownerId,
			fd({ id: botId, reason: 'user_revoke' })
		);
		expect(result).toMatchObject({ ok: true });
		if (!('ok' in result) || !result.ok) return;
		expect(result.botClient.revoked_at).toBeTruthy();
		expect(result.botClient).not.toHaveProperty('key_hash');
	});
});

describe('handleSetBotKeyExpiry / setRateLimit', () => {
	it('rejects clearing expiry on importer', async () => {
		listBotClients.mockResolvedValue({
			data: [publicBot({ profile: 'importer', expires_at: '2027-01-01T00:00:00.000Z' })],
			error: null
		});
		const result = await handleSetBotKeyExpiry(
			{} as never,
			ownerId,
			fd({ id: botId, expires_at: '' })
		);
		expect(result).toMatchObject({
			status: 400,
			data: expect.objectContaining({ ok: false, ruleIds: ['R-PERM-10'] })
		});
		expect(setBotClientExpiry).not.toHaveBeenCalled();
	});

	it('updates rate limit', async () => {
		setBotClientRateLimit.mockResolvedValue({
			data: publicBot({ rate_limit_per_min: 30 }),
			error: null
		});
		const result = await handleSetBotKeyRateLimit(
			{} as never,
			ownerId,
			fd({ id: botId, rate_limit_per_min: '30' })
		);
		expect(result).toMatchObject({ ok: true });
		expect(setBotClientRateLimit).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ rateLimitPerMin: 30 })
		);
	});
});

describe('QA Low-1: expires_at must carry an offset (R-SYS-02 · R-VAL-T02)', () => {
	const INVALID = 'expires_at must be a valid ISO datetime';

	it.each([
		'2026-11-30T10:00',
		'2026-11-30T10:00:00',
		'2026-11-30T10:00:00.000',
		'2026-11-30T10:00:00.123456',
		'2026-11-30 10:00',
		'2026-11-30 10:00:00',
		'2026-11-30',
		'2026-11-30T10:00+0900',
		'2026-11-30T10:00+09',
		'2026-11-30T10:00 +09:00',
		'2026-02-30T10:00+09:00',
		'2026-11-30T24:00+09:00',
		'2026-11-30T10:00+15:00',
		'Mon, 30 Nov 2026 10:00:00 GMT',
		'not-a-date'
	])('rejects %s without inferring an offset', (raw) => {
		expect(parseOptionalIso(raw)).toEqual({ error: INVALID });
	});

	it.each([
		['2026-11-30T10:00+09:00', '2026-11-30T01:00:00.000Z'],
		['2026-11-30T10:00:00+09:00', '2026-11-30T01:00:00.000Z'],
		['2026-11-30T10:00:00.000+09:00', '2026-11-30T01:00:00.000Z'],
		['2026-11-30T01:00:00.000Z', '2026-11-30T01:00:00.000Z'],
		['2026-11-30T01:00Z', '2026-11-30T01:00:00.000Z'],
		['2027-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z'],
		['2028-02-29T09:00+09:00', '2028-02-29T00:00:00.000Z'],
		['2026-11-29T20:00-05:00', '2026-11-30T01:00:00.000Z']
	])('accepts %s as instant %s', (raw, iso) => {
		expect(parseOptionalIso(raw)).toBe(iso);
	});

	it('empty string clears the optional expiry (null)', () => {
		expect(parseOptionalIso('')).toBeNull();
	});

	it('issue: naive datetime-local value is rejected (no-JS submit), RPC not called', async () => {
		const result = await handleIssueBotKey(
			{} as never,
			ownerId,
			fd({ name: 'preview-importer', profile: 'importer', expires_at: '2026-11-30T10:00' })
		);
		expect(result).toMatchObject({
			status: 400,
			data: expect.objectContaining({ ok: false, message: INVALID, ruleIds: ['R-PERM-10'] })
		});
		expect(issueBotClientRpc).not.toHaveBeenCalled();
	});

	it('issue: +09:00 is stored as the KST 10:00 instant', async () => {
		issueBotClientRpc.mockResolvedValue({ data: publicBot(), error: null });
		const result = await handleIssueBotKey(
			{} as never,
			ownerId,
			fd({ name: 'preview-importer', profile: 'importer', expires_at: '2026-11-30T10:00+09:00' })
		);
		expect(result).toMatchObject({ ok: true });
		expect(issueBotClientRpc).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ expiresAt: '2026-11-30T01:00:00.000Z' })
		);
	});

	it('issue: empty expiry on a non-importer profile stays null', async () => {
		issueBotClientRpc.mockResolvedValue({ data: publicBot(), error: null });
		await handleIssueBotKey(
			{} as never,
			ownerId,
			fd({ name: 'preview-finance-manager', profile: 'finance-manager', expires_at: '' })
		);
		expect(issueBotClientRpc).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ expiresAt: null })
		);
	});

	it('setExpiry: naive value is rejected before any DB call', async () => {
		const result = await handleSetBotKeyExpiry(
			{} as never,
			ownerId,
			fd({ id: botId, expires_at: '2026-11-30T10:00' })
		);
		expect(result).toMatchObject({
			status: 400,
			data: expect.objectContaining({ ok: false, message: INVALID })
		});
		expect(listBotClients).not.toHaveBeenCalled();
		expect(setBotClientExpiry).not.toHaveBeenCalled();
	});

	it('setExpiry: +09:00 stores the KST instant; Z is accepted as-is', async () => {
		listBotClients.mockResolvedValue({ data: [publicBot({ profile: 'importer' })], error: null });
		setBotClientExpiry.mockResolvedValue({ data: publicBot(), error: null });
		await handleSetBotKeyExpiry(
			{} as never,
			ownerId,
			fd({ id: botId, expires_at: '2026-11-30T10:00+09:00' })
		);
		await handleSetBotKeyExpiry(
			{} as never,
			ownerId,
			fd({ id: botId, expires_at: '2026-11-30T01:00:00.000Z' })
		);
		expect(setBotClientExpiry).toHaveBeenNthCalledWith(1, expect.anything(), {
			id: botId,
			expiresAt: '2026-11-30T01:00:00.000Z'
		});
		expect(setBotClientExpiry).toHaveBeenNthCalledWith(2, expect.anything(), {
			id: botId,
			expiresAt: '2026-11-30T01:00:00.000Z'
		});
	});

	it('setExpiry: empty clears a non-importer expiry (null)', async () => {
		listBotClients.mockResolvedValue({ data: [publicBot()], error: null });
		setBotClientExpiry.mockResolvedValue({ data: publicBot(), error: null });
		await handleSetBotKeyExpiry({} as never, ownerId, fd({ id: botId, expires_at: '' }));
		expect(setBotClientExpiry).toHaveBeenCalledWith(expect.anything(), {
			id: botId,
			expiresAt: null
		});
	});
});

describe('revoke then authenticate → 401', () => {
	it('mcp_authenticate empty after revoke maps to 401 invalid_key', async () => {
		vi.resetModules();
		const rpcMock = vi.fn().mockResolvedValue({ data: [], error: null });
		vi.doMock('$lib/supabase/admin', () => ({
			createSupabaseAdminClient: () => ({ rpc: rpcMock })
		}));
		const { authenticate } = await import('$lib/server/mcp/auth');
		const secret = 'A'.repeat(43);
		const key = `mowa_abcdefgh12_${secret}`;
		const r = await authenticate(
			new Request('https://x/api/mcp', {
				method: 'POST',
				headers: { authorization: `Bearer ${key}` }
			}),
			{ MCP_KEY_PEPPER: pepper, MCP_AUTH_MODE: 'db' }
		);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.status).toBe(401);
			expect(r.reason).toBe('invalid_key');
		}
	});
});
