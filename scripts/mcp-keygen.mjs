#!/usr/bin/env node
// 봇 API 키 생성기 (로컬 전용). 사용: MCP_KEY_PEPPER=... node scripts/mcp-keygen.mjs
// 출력의 key는 봇에만 전달하고, prefix/hash만 서버(env 또는 bot_clients)에 저장한다.
import { webcrypto as c } from 'node:crypto';

const pepper = process.env.MCP_KEY_PEPPER;
if (!pepper) {
	console.error('MCP_KEY_PEPPER 환경변수가 필요합니다. (생성: openssl rand -base64 48)');
	process.exit(1);
}
const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
const rnd = c.getRandomValues(new Uint8Array(10));
const prefix = [...rnd].map((b) => alphabet[b % alphabet.length]).join('');
const secret = Buffer.from(c.getRandomValues(new Uint8Array(32))).toString('base64url');
const k = await c.subtle.importKey(
	'raw',
	new TextEncoder().encode(pepper),
	{ name: 'HMAC', hash: 'SHA-256' },
	false,
	['sign']
);
const hash = Buffer.from(await c.subtle.sign('HMAC', k, new TextEncoder().encode(secret))).toString(
	'hex'
);
console.log(JSON.stringify({ key: `mowa_${prefix}_${secret}`, prefix, hash }, null, 2));
