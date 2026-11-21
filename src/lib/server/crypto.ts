// Web Crypto only (Cloudflare Workers 호환). node:crypto 금지.
const enc = new TextEncoder();

/** Same alphabet as scripts/mcp-keygen.mjs — key_prefix is [a-z0-9]{10}. */
const KEY_PREFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function toHex(buf: ArrayBuffer): string {
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256Hex(key: string, message: string): Promise<string> {
	const k = await crypto.subtle.importKey(
		'raw',
		enc.encode(key),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	return toHex(await crypto.subtle.sign('HMAC', k, enc.encode(message)));
}

export async function sha256Hex(message: string): Promise<string> {
	return toHex(await crypto.subtle.digest('SHA-256', enc.encode(message)));
}

/** 길이가 같은 hex 문자열의 상수시간 비교 */
export function timingSafeEqualHex(a: string, b: string): boolean {
	if (a.length !== b.length || a.length === 0) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/** base64url without padding (32B → 43 chars), matching mcp-keygen.mjs. */
export function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * CSPRNG bot API key (R-PERM-10 / design §5-2).
 * Format: `mowa_<prefix10 [a-z0-9]>_<secret43 base64url(32B)>`.
 * Caller hashes `secret` with MCP_KEY_PEPPER and persists only prefix + key_hash.
 */
export function generateBotApiKey(): { key: string; prefix: string; secret: string } {
	const prefixBytes = crypto.getRandomValues(new Uint8Array(10));
	const prefix = [...prefixBytes]
		.map((b) => KEY_PREFIX_ALPHABET[b % KEY_PREFIX_ALPHABET.length]!)
		.join('');
	const secret = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
	return { key: `mowa_${prefix}_${secret}`, prefix, secret };
}
