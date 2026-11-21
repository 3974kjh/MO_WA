/**
 * Host allowlist for MCP smoke (BE-04 Low 2).
 * Never logs secrets. Used by scripts/mcp-smoke.mjs and unit tests.
 */

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);

/** Production / non-preview labels under mo-wa.pages.dev — always refused. */
export const REFUSED_PAGES_ALIASES = Object.freeze(['main', 'www', 'production', 'prod']);

const REFUSED_ALIAS_SET = new Set(REFUSED_PAGES_ALIASES);

/**
 * Genuine Cloudflare Pages Preview for this project:
 *   <preview-label>.mo-wa.pages.dev
 * where preview-label is a single DNS label (branch alias or deployment id),
 * not a production alias (main / www / …) and not the apex.
 *
 * Loopback only otherwise. Apex and unknown hosts are refused.
 */
export function isAllowedMcpSmokeHost(hostname) {
	if (typeof hostname !== 'string' || !hostname) return false;
	const host = hostname.toLowerCase().replace(/\.$/, '');
	if (LOOPBACK.has(host)) return true;

	// Exactly one label before mo-wa.pages.dev (4 labels total).
	const m = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.mo-wa\.pages\.dev$/.exec(host);
	if (!m) return false;
	const label = m[1];
	if (REFUSED_ALIAS_SET.has(label)) return false;
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
