// Web Crypto only (Cloudflare Workers 호환). node:crypto 금지.
const enc = new TextEncoder();

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
