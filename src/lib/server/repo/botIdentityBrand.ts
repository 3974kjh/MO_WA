/**
 * Brand for BotRepoIdentity.
 * Only BE-04 MCP auth may mint identities (`mcp/auth.ts` imports this module).
 * Not re-exported from `$lib/server/repo` index.
 */
export const BOT_REPO_IDENTITY_BRAND = Symbol('mowa.BotRepoIdentity');

export type BotRepoIdentity = {
	readonly ownerId: string;
	readonly botClientId: string;
	readonly [BOT_REPO_IDENTITY_BRAND]: typeof BOT_REPO_IDENTITY_BRAND;
};

/** Mint a branded bot identity — call only from `src/lib/server/mcp/auth.ts` (BE-04). */
export function mintBotRepoIdentity(ownerId: string, botClientId: string): BotRepoIdentity {
	if (!ownerId) throw new Error('[R-SYS-01] ownerId is required');
	if (!botClientId) throw new Error('[R-PERM-03] botClientId is required');
	return {
		ownerId,
		botClientId,
		[BOT_REPO_IDENTITY_BRAND]: BOT_REPO_IDENTITY_BRAND
	};
}

export function isBotRepoIdentity(value: unknown): value is BotRepoIdentity {
	if (!value || typeof value !== 'object') return false;
	const v = value as Record<PropertyKey, unknown>;
	return (
		v[BOT_REPO_IDENTITY_BRAND] === BOT_REPO_IDENTITY_BRAND &&
		typeof v.ownerId === 'string' &&
		typeof v.botClientId === 'string'
	);
}
