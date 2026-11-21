/**
 * Host allowlist for MCP smoke (BE-04).
 * Never logs secrets. Used by scripts/mcp-smoke.mjs and unit tests.
 *
 * Default: loopback + branch-alias Preview only.
 * 8-hex unique-deployment hosts (Preview or operational) are refused unless
 * explicitly listed in MCP_SMOKE_ALLOWED_HOSTS (comma-separated hostnames).
 */

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);

/** Production / non-preview labels under mo-wa.pages.dev — always refused. */
export const REFUSED_PAGES_ALIASES = Object.freeze(['main', 'www', 'production', 'prod']);

const REFUSED_ALIAS_SET = new Set(REFUSED_PAGES_ALIASES);

/** Cloudflare Pages unique-deployment host label: exactly 8 hex chars. */
export const UNIQUE_DEPLOYMENT_LABEL_RE = /^[a-f0-9]{8}$/i;

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined> | undefined} env
 * @returns {Set<string>}
 */
export function parseSmokeAllowedHosts(env) {
	const raw = env?.MCP_SMOKE_ALLOWED_HOSTS ?? '';
	if (typeof raw !== 'string' || !raw.trim()) return new Set();
	return new Set(
		raw
			.split(',')
			.map((s) => s.trim().toLowerCase().replace(/\.$/, ''))
			.filter(Boolean)
	);
}

/**
 * @param {string} hostname
 * @param {{ env?: NodeJS.ProcessEnv | Record<string, string | undefined>; allowedHosts?: Iterable<string> }} [options]
 */
export function isAllowedMcpSmokeHost(hostname, options = {}) {
	if (typeof hostname !== 'string' || !hostname) return false;
	const host = hostname.toLowerCase().replace(/\.$/, '');
	if (LOOPBACK.has(host)) return true;

	const explicit =
		options.allowedHosts != null
			? new Set([...options.allowedHosts].map((h) => String(h).toLowerCase().replace(/\.$/, '')))
			: parseSmokeAllowedHosts(options.env ?? (typeof process !== 'undefined' ? process.env : {}));

	// Exactly one label before mo-wa.pages.dev (4 labels total).
	const m = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.mo-wa\.pages\.dev$/.exec(host);
	if (!m) return false;
	const label = m[1];
	if (REFUSED_ALIAS_SET.has(label)) return false;

	// 8-hex unique-deployment hosts: refused by default (Preview hash or operational).
	if (UNIQUE_DEPLOYMENT_LABEL_RE.test(label)) {
		return explicit.has(host);
	}

	// Branch-alias Preview (e.g. cursor-be-04-db-auth.mo-wa.pages.dev).
	return true;
}

/** Whoami structuredContent must prove DB mode + expected bot name. */
export function assertDbWhoami(structured, expectedBot) {
	if (!structured || typeof structured !== 'object') {
		return { ok: false, reason: 'missing structuredContent' };
	}
	if (structured.auth_mode !== 'db') {
		return {
			ok: false,
			reason: `auth_mode must be exactly "db" (got ${JSON.stringify(structured.auth_mode)})`
		};
	}
	if (typeof expectedBot !== 'string' || !expectedBot) {
		return { ok: false, reason: 'MCP_WHOAMI_BOT required' };
	}
	if (structured.bot !== expectedBot) {
		return {
			ok: false,
			reason: `bot must equal MCP_WHOAMI_BOT (got len=${String(structured.bot ?? '').length})`
		};
	}
	return { ok: true };
}
