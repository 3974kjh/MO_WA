/**
 * MCP auth (BE-04).
 *
 * After a successful `mcp_authenticate`, this module will call
 * `mintBotRepoIdentity` from `repo/botIdentityBrand` and pass the frozen
 * identity to `forBot`. Mint is intentionally **not** re-exported — callers
 * outside auth must not construct BotRepoIdentity.
 */
export type { BotRepoIdentity } from '../repo/botIdentityBrand';

// BE-04 will import mintBotRepoIdentity here only (not re-export):
// import { mintBotRepoIdentity } from '../repo/botIdentityBrand';
