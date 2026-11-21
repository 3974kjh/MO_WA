import { describe, expect, it } from 'vitest';
import { authenticate, parseBearer } from './auth';
import { hmacSha256Hex } from '$lib/server/crypto';

const secret = 'A'.repeat(43);
const key = `mowa_abcdefgh12_${secret}`;
const req = (h?: string) => new Request('https://x/api/mcp', { method: 'POST', headers: h ? { authorization: h } : {} });

describe('parseBearer', () => {
	it('accepts well-formed key', () => expect(parseBearer(`Bearer ${key}`)).toEqual({ prefix: 'abcdefgh12', secret }));
	it('rejects malformed', () => {
		expect(parseBearer(null)).toBeNull();
		expect(parseBearer('Bearer mowa_short_x')).toBeNull();
		expect(parseBearer(`Basic ${key}`)).toBeNull();
	});
});

describe('authenticate (env mode)', async () => {
	const pepper = 'test-pepper';
	const hash = await hmacSha256Hex(pepper, secret);
	const env = { MCP_KEY_PEPPER: pepper, MCP_SPIKE_KEY_PREFIX: 'abcdefgh12', MCP_SPIKE_KEY_HASH: hash };
	it('ok with right key', async () => expect((await authenticate(req(`Bearer ${key}`), env)).ok).toBe(true));
	it('401 with wrong secret', async () => {
		const r = await authenticate(req(`Bearer mowa_abcdefgh12_${'B'.repeat(43)}`), env);
		expect(r.ok ? 0 : r.status).toBe(401);
	});
	it('401 without header', async () => expect((await authenticate(req(), env)).ok).toBe(false));
	it('500 without pepper', async () => {
		const r = await authenticate(req(`Bearer ${key}`), { ...env, MCP_KEY_PEPPER: undefined });
		expect(r.ok ? 0 : r.status).toBe(500);
	});
});
