/**
 * Repository public API.
 *
 * M-4: db lives only in a module-internal WeakMap (`db.ts`) — never exported.
 * Do not import repo/client, repo/db, or botIdentityBrand from outside repo
 * (ESLint). Mint BotRepoIdentity only inside mcp/auth after mcp_authenticate
 * (mint is not re-exported). M-5: Do not call runRules from create/update paths.
 */
export {
	forBot,
	forUser,
	serverCreateStamps,
	stripClientIdentity,
	type BotRepoIdentity,
	type RepoActor,
	type RepoClient
} from './client';
export {
	formatOwnerDisplayId,
	isOwnerDisplayId,
	parseOwnerDisplayId,
	type DisplayIdPrefix
} from './displayId';
export { OwnerScopeError, requireOwnerId, withOwnerFilter } from './owner';
export {
	SYSTEM_PATCH_BLOCKLIST,
	pickPatchable,
	REPORT_PATCHABLE,
	POSITION_PATCHABLE,
	JOURNAL_PATCHABLE,
	INSTRUMENT_PATCHABLE
} from './patch';
export { archiveRow, restoreRow, type ArchivableTable } from './archive';
export { pingDatabase, type DatabasePingResult } from './health';
export { createRepoAuditSink } from './mcpAuditSink';
export * from './instruments.repo';
export * from './journal.repo';
export * from './positions.repo';
export * from './proposals.repo';
export * from './reports.repo';
