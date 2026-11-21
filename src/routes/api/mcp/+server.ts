import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { authenticate, type AuthEnv } from '$lib/server/mcp/auth';
import { handleMcp } from '$lib/server/mcp/handler';

const mcpEnv = (): AuthEnv => ({
	MCP_KEY_PEPPER: env.MCP_KEY_PEPPER,
	MCP_AUTH_MODE: env.MCP_AUTH_MODE,
	MCP_SPIKE_KEY_PREFIX: env.MCP_SPIKE_KEY_PREFIX,
	MCP_SPIKE_KEY_HASH: env.MCP_SPIKE_KEY_HASH
});

const MAX_BODY = 1_500_000;
const ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)?mo-wa\.pages\.dev$/;

const jsonError = (status: number, error: string, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify({ error }), {
		status,
		headers: { 'content-type': 'application/json', ...headers }
	});

export const POST: RequestHandler = async ({ request }) => {
	const t0 = Date.now();
	if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return jsonError(413, 'payload_too_large');
	const origin = request.headers.get('origin');
	if (origin && !ORIGIN_RE.test(origin)) return jsonError(403, 'origin_not_allowed');

	const auth = await authenticate(request, mcpEnv());
	if (!auth.ok) {
		console.warn(JSON.stringify({ evt: 'mcp_auth_fail', status: auth.status, reason: auth.reason, ray: request.headers.get('cf-ray') }));
		const headers: Record<string, string> = {};
		if (auth.status === 401) headers['www-authenticate'] = 'Bearer realm="mo-wa-mcp"';
		if (auth.status === 429) headers['retry-after'] = String(auth.retryAfter ?? 60);
		return jsonError(auth.status, auth.reason, headers);
	}

	const res = await handleMcp(request, auth.ctx);
	console.log(JSON.stringify({ evt: 'mcp', bot: auth.ctx.botName, status: res.status, ms: Date.now() - t0 }));
	return res;
};

const notAllowed: RequestHandler = () => new Response(null, { status: 405, headers: { allow: 'POST' } });
export const GET = notAllowed;
export const DELETE = notAllowed;
