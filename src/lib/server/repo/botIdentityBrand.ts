/**
 * BotRepoIdentity authenticity (M-4).
 *
 * Membership in a module-internal WeakSet is the only authenticity signal —
 * attaching a Symbol, spreading a legit identity, or mutating fields must not
 * produce a value that `forBot` accepts. Identities are frozen at mint.
 *
 * Call `mintBotRepoIdentity` only from `src/lib/server/mcp/auth.ts` after a
 * successful `mcp_authenticate` (BE-04). Do not re-export mint from mcp/auth.
 * Not re-exported from `$lib/server/repo` index.
 */

export type BotRepoIdentity = {
	readonly ownerId: string;
	readonly botClientId: string;
};

/** Module-internal — never exported. */
const mintedIdentities = new WeakSet<object>();

/** Mint a frozen bot identity — call only from `mcp/auth.ts` (BE-04). */
export function mintBotRepoIdentity(ownerId: string, botClientId: string): BotRepoIdentity {
	if (!ownerId) throw new Error('[R-SYS-01] ownerId is required');
	if (!botClientId) throw new Error('[R-PERM-03] botClientId is required');
	const identity = Object.freeze({ ownerId, botClientId });
	mintedIdentities.add(identity);
	return identity;
}

export function isBotRepoIdentity(value: unknown): value is BotRepoIdentity {
	return typeof value === 'object' && value !== null && mintedIdentities.has(value);
}
