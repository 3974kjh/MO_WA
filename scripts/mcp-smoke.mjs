#!/usr/bin/env node
/**
 * Local / Preview MCP smoke (S1–S10 subset). Never prints key material.
 * Refuses production hosts (apex mo-wa.pages.dev and non-branch pages.dev).
 *
 * Usage:
 *   MCP_SMOKE_URL=http://127.0.0.1:5173/api/mcp MCP_SMOKE_KEY=mowa_… node scripts/mcp-smoke.mjs
 *   MCP_SMOKE_URL=https://<branch>.mo-wa.pages.dev/api/mcp …  (Preview only)
 */
const url = process.env.MCP_SMOKE_URL ?? '';
const key = process.env.MCP_SMOKE_KEY ?? '';

function refuse(msg) {
	console.error(`REFUSED: ${msg}`);
	process.exit(2);
}

if (!url) refuse('MCP_SMOKE_URL required');
let parsed;
try {
	parsed = new URL(url);
} catch {
	refuse('MCP_SMOKE_URL is not a valid URL');
}

const host = parsed.hostname.toLowerCase();
const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
const isBranchPreview =
	host.endsWith('.mo-wa.pages.dev') && host !== 'mo-wa.pages.dev' && host.split('.').length >= 4;
if (!isLoopback && !isBranchPreview) {
	refuse(
		`host ${host} is not loopback or a branch Preview (*.mo-wa.pages.dev). Production apex blocked.`
	);
}
if (host === 'mo-wa.pages.dev') refuse('production apex mo-wa.pages.dev is blocked');

if (!key || !/^mowa_[a-z0-9]{10}_[A-Za-z0-9_-]{43}$/.test(key)) {
	refuse('MCP_SMOKE_KEY missing or malformed (not printed)');
}

const auth = { authorization: `Bearer ${key}` };

async function post(body, headers = {}) {
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream',
			...headers
		},
		body: JSON.stringify(body)
	});
	const text = await res.text();
	let json = null;
	try {
		json = JSON.parse(text);
	} catch {
		/* sse or empty */
	}
	return { status: res.status, headers: res.headers, text, json };
}

function assert(cond, label) {
	if (!cond) {
		console.error(`FAIL ${label}`);
		process.exit(1);
	}
	console.log(`PASS ${label}`);
}

// S1 unauth
{
	const r = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: '{}'
	});
	assert(r.status === 401, 'S1 unauth → 401');
	assert(
		(r.headers.get('www-authenticate') || '').toLowerCase().includes('bearer'),
		'S1 WWW-Authenticate'
	);
}
// S1 malformed
{
	const r = await post(
		{ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
		{
			authorization: 'Bearer not-a-key'
		}
	);
	assert(r.status === 401, 'S1 malformed → 401');
}

// S2 GET
{
	const r = await fetch(url, { method: 'GET' });
	assert(r.status === 405, 'S2 GET → 405');
}

// S2 bad origin
{
	const r = await post(
		{
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: {
				protocolVersion: '2024-11-05',
				capabilities: {},
				clientInfo: { name: 'smoke', version: '0' }
			}
		},
		{ ...auth, origin: 'https://evil.example' }
	);
	assert(r.status === 403, 'S2 bad Origin → 403');
}

const initBody = {
	jsonrpc: '2.0',
	id: 1,
	method: 'initialize',
	params: {
		protocolVersion: '2024-11-05',
		capabilities: {},
		clientInfo: { name: 'smoke', version: '0' }
	}
};

// S3 initialize
{
	const t0 = Date.now();
	const r = await post(initBody, auth);
	assert(r.status === 200, 'S3 initialize → 200');
	assert(!r.headers.get('mcp-session-id'), 'S3 no Mcp-Session-Id');
	const name = r.json?.result?.serverInfo?.name;
	assert(name === 'mo-wa', `S3 serverInfo.name=mo-wa (got ${name})`);
	console.log(`note S3 wall_ms=${Date.now() - t0}`);
}

// S4 tools/list
{
	const r = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, auth);
	assert(r.status === 200, 'S4 tools/list → 200');
	const tools = r.json?.result?.tools ?? [];
	const names = tools.map((t) => t.name).sort();
	assert(
		JSON.stringify(names) === JSON.stringify(['db_ping', 'echo', 'whoami']),
		`S4 tools=${names.join(',')}`
	);
	for (const t of tools) {
		assert(t.inputSchema && t.outputSchema, `S4 ${t.name} has inputSchema+outputSchema`);
	}
}

// S5 whoami
{
	const t0 = Date.now();
	const r = await post(
		{ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'whoami', arguments: {} } },
		auth
	);
	assert(r.status === 200, 'S5 whoami → 200');
	const sc = r.json?.result?.structuredContent;
	assert(sc && typeof sc.bot === 'string', 'S5 structuredContent.bot');
	assert(typeof sc.bot_client_id === 'string', 'S5 bot_client_id');
	assert(Array.isArray(sc.scopes), 'S5 scopes');
	assert(typeof sc.auth_mode === 'string', 'S5 auth_mode');
	assert(Array.isArray(r.json?.result?.content), 'S5 text content');
	console.log(
		`note S5 auth_mode=${sc.auth_mode} bot_len=${sc.bot.length} wall_ms=${Date.now() - t0}`
	);
}

// BE-04-H spoof header
{
	const r = await post(
		{ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'whoami', arguments: {} } },
		{ ...auth, 'x-mowa-bot-id': '99999999-9999-4999-8999-999999999999' }
	);
	const sc = r.json?.result?.structuredContent;
	const baseline = await post(
		{ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'whoami', arguments: {} } },
		auth
	);
	const base = baseline.json?.result?.structuredContent;
	assert(
		sc?.bot_client_id === base?.bot_client_id &&
			sc?.bot === base?.bot &&
			sc?.bot_client_id !== '99999999-9999-4999-8999-999999999999',
		'BE-04-H spoofed x-mowa-bot-id ignored'
	);
}

// S6 echo zod fail
{
	const r = await post(
		{
			jsonrpc: '2.0',
			id: 6,
			method: 'tools/call',
			params: { name: 'echo', arguments: { message: '' } }
		},
		auth
	);
	assert(r.status === 200, 'S6 zod fail HTTP 200');
	assert(r.json?.result?.isError === true, 'S6 isError true');
}

console.log('smoke done (no key material printed)');
