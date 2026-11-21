import { describe, expect, it } from 'vitest';
import { generateBotApiKey, hmacSha256Hex } from './crypto';

const KEY_RE = /^mowa_([a-z0-9]{10})_([A-Za-z0-9_-]{43})$/;

describe('generateBotApiKey (BE-12)', () => {
	it('matches KEY_RE / mcp-keygen format', () => {
		const { key, prefix, secret } = generateBotApiKey();
		expect(key).toMatch(KEY_RE);
		expect(prefix).toHaveLength(10);
		expect(secret).toHaveLength(43);
		expect(key).toBe(`mowa_${prefix}_${secret}`);
	});

	it('produces distinct keys', () => {
		const a = generateBotApiKey();
		const b = generateBotApiKey();
		expect(a.key).not.toBe(b.key);
		expect(a.prefix).not.toBe(b.prefix);
	});

	it('HMAC of secret is 64 hex chars (key_hash shape)', async () => {
		const { secret } = generateBotApiKey();
		const hash = await hmacSha256Hex('test-pepper', secret);
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
	});
});
