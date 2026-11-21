/** Web Crypto helpers for MCP audit digests (Workers-safe; no node:crypto). */

const enc = new TextEncoder();

export function toHex(buf: ArrayBuffer): string {
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(message: string): Promise<string> {
	return toHex(await crypto.subtle.digest('SHA-256', enc.encode(message)));
}
