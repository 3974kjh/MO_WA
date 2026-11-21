/**
 * MCP auth (BE-04). Brand mint for repo `forBot` lives here so plain objects cannot
 * construct {@link BotRepoIdentity}. Pair verification via `mcp_authenticate` is BE-04.
 */
export {
	mintBotRepoIdentity,
	type BotRepoIdentity
} from '../repo/botIdentityBrand';
