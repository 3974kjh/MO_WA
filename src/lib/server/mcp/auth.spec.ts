import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hmacSha256Hex } from '$lib/server/crypto';

const secret = 'A'.repeat(43);
const key = `mowa_abcdefgh12_${secret}`;
const req = (headers: Record<string, string> = {}) =>
	new Request('https://x/api/mcp', {
		method: 'POST',
		headers: { ...headers }
	});

describe('parseBearer', async () => {
	const { parseBearer } = await import('./auth');
	it('accepts well-formed key', () =>
		expect(parseBearer(`Bearer ${key}`)).toEqual({ prefix: 'abcdefgh12', secret }));
	it('rejects malformed', () => {
		expect(parseBearer(null)).toBeNull();
		expect(parseBearer('Bearer mowa_short_x')).toBeNull();
		expect(parseBearer(`Basic ${key}`)).toBeNull();
	});
});

describe('authenticate (env mode)', async () => {
	const { authenticate } = await import('./auth');
	const pepper = 'test-pepper';
	const hash = await hmacSha256Hex(pepper, secret);
	const env = {
		MCP_KEY_PEPPER: pepper,
		MCP_SPIKE_KEY_PREFIX: 'abcdefgh12',
		MCP_SPIKE_KEY_HASH: hash
	};
	it('ok with right key', async () => {
		const r = await authenticate(req({ authorization: `Bearer ${key}` }), env);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.ctx.mode).toBe('env');
			expect(r.ctx.botName).toBe('spike');
			expect(r.repo).toBeNull();
		}
	});
	it('401 with wrong secret', async () => {
		const r = await authenticate(
			req({ authorization: `Bearer mowa_abcdefgh12_${'B'.repeat(43)}` }),
			env
		);
		expect(r.ok ? 0 : r.status).toBe(401);
	});
	it('401 without header', async () => expect((await authenticate(req(), env)).ok).toBe(false));
	it('500 without pepper', async () => {
		const r = await authenticate(req({ authorization: `Bearer ${key}` }), {
			...env,
			MCP_KEY_PEPPER: undefined
		});
		expect(r.ok ? 0 : r.status).toBe(500);
	});
	it('does not read spoofed x-mowa-bot-id (env)', async () => {
		const r = await authenticate(
			req({
				authorization: `Bearer ${key}`,
				'x-mowa-bot-id': '00000000-0000-4000-8000-spoofed00001'
			}),
			env
		);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.ctx.botClientId).toBe('env:abcdefgh12');
	});
});

describe('authenticate (db mode)', () => {
	const pepper = 'db-pepper';
	const botId = '11111111-1111-4111-8111-111111111111';
	const ownerId = '22222222-2222-4222-8222-222222222222';
	let rpcMock: ReturnType<typeof vi.fn>;
	let forBotMock: ReturnType<typeof vi.fn>;
	let mintSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.resetModules();
		rpcMock = vi.fn();
		forBotMock = vi.fn(() => ({ actor: { kind: 'bot', ownerId, botClientId: botId } }));
		mintSpy = vi.fn((o: string, b: string) => Object.freeze({ ownerId: o, botClientId: b }));

		vi.doMock('$lib/supabase/admin', () => ({
			createSupabaseAdminClient: () => ({
				rpc: rpcMock
			})
		}));
		vi.doMock('$lib/server/repo', async () => {
			const actual = await vi.importActual<typeof import('$lib/server/repo')>('$lib/server/repo');
			return { ...actual, forBot: forBotMock };
		});
		vi.doMock('../repo/botIdentityBrand', async () => {
			const actual = await vi.importActual<typeof import('../repo/botIdentityBrand')>(
				'../repo/botIdentityBrand'
			);
			return {
				...actual,
				mintBotRepoIdentity: mintSpy,
				isBotRepoIdentity: () => true
			};
		});
	});

	async function loadAuth() {
		return import('./auth');
	}

	it('success: mints identity, forBot, profile + mode=db', async () => {
		const hash = await hmacSha256Hex(pepper, secret);
		rpcMock.mockResolvedValue({
			data: [
				{
					bot_client_id: botId,
					owner_id: ownerId,
					bot_name: 'local-bot',
					profile: 'finance-manager',
					scopes: ['read'],
					allowed: true,
					retry_after_s: 0
				}
			],
			error: null
		});
		const { authenticate } = await loadAuth();
		const r = await authenticate(req({ authorization: `Bearer ${key}` }), {
			MCP_KEY_PEPPER: pepper,
			MCP_AUTH_MODE: 'db'
		});
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.ctx).toMatchObject({
			botClientId: botId,
			ownerId,
			botName: 'local-bot',
			profile: 'finance-manager',
			mode: 'db'
		});
		expect([...r.ctx.scopes]).toEqual(['read']);
		expect(mintSpy).toHaveBeenCalledWith(ownerId, botId);
		expect(forBotMock).toHaveBeenCalled();
		expect(r.repo).toBeTruthy();
		expect(rpcMock).toHaveBeenCalledWith(
			'mcp_authenticate',
			expect.objectContaining({ p_prefix: 'abcdefgh12', p_hash: hash })
		);
	});

	it('401 when RPC returns empty (invalid/revoked/expired)', async () => {
		rpcMock.mockResolvedValue({ data: [], error: null });
		const { authenticate } = await loadAuth();
		const r = await authenticate(req({ authorization: `Bearer ${key}` }), {
			MCP_KEY_PEPPER: pepper,
			MCP_AUTH_MODE: 'db'
		});
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.status).toBe(401);
			expect(r.reason).toBe('invalid_key');
		}
		expect(mintSpy).not.toHaveBeenCalled();
	});

	it('429 + rate_limited ctx when allowed=false', async () => {
		rpcMock.mockResolvedValue({
			data: [
				{
					bot_client_id: botId,
					owner_id: ownerId,
					bot_name: 'local-bot',
					profile: 'finance-manager',
					scopes: ['read'],
					allowed: false,
					retry_after_s: 42
				}
			],
			error: null
		});
		const { authenticate } = await loadAuth();
		const r = await authenticate(req({ authorization: `Bearer ${key}` }), {
			MCP_KEY_PEPPER: pepper,
			MCP_AUTH_MODE: 'db'
		});
		expect(r.ok).toBe(false);
		if (!r.ok && r.status === 429) {
			expect(r.reason).toBe('rate_limited');
			expect(r.retryAfter).toBe(42);
			expect(r.ctx.botClientId).toBe(botId);
			expect(r.ctx.ownerId).toBe(ownerId);
			expect(r.ctx.mode).toBe('db');
		}
		expect(mintSpy).not.toHaveBeenCalled();
	});

	it('malformed key → 401 without hitting RPC', async () => {
		const { authenticate } = await loadAuth();
		const r = await authenticate(req({ authorization: 'Bearer not-a-key' }), {
			MCP_KEY_PEPPER: pepper,
			MCP_AUTH_MODE: 'db'
		});
		expect(r.ok ? 0 : r.status).toBe(401);
		expect(rpcMock).not.toHaveBeenCalled();
	});

	it('BE-04-H: spoofed x-mowa-bot-id does not change bot_client_id', async () => {
		rpcMock.mockResolvedValue({
			data: [
				{
					bot_client_id: botId,
					owner_id: ownerId,
					bot_name: 'local-bot',
					profile: 'equity-analyst',
					scopes: ['read'],
					allowed: true,
					retry_after_s: 0
				}
			],
			error: null
		});
		const { authenticate } = await loadAuth();
		const spoof = '99999999-9999-4999-8999-999999999999';
		const r = await authenticate(
			req({
				authorization: `Bearer ${key}`,
				'x-mowa-bot-id': spoof
			}),
			{ MCP_KEY_PEPPER: pepper, MCP_AUTH_MODE: 'db' }
		);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.ctx.botClientId).toBe(botId);
			expect(r.ctx.botClientId).not.toBe(spoof);
			expect(mintSpy).toHaveBeenCalledWith(ownerId, botId);
		}
	});

	it('does not re-export mintBotRepoIdentity', async () => {
		const mcpAuth = await loadAuth();
		expect('mintBotRepoIdentity' in mcpAuth).toBe(false);
	});
});
