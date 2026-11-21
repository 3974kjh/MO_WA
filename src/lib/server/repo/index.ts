/**
 * Repository public API.
 *
 * M-4: `RepoClient.db` is not exported — use repo functions only.
 * M-5: Do not call `runRules` from these create/update paths (MCP/web own validation).
 * REPO_DB / getRepoDb stay module-private (not re-exported).
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
export * from './instruments.repo';
export * from './journal.repo';
export * from './positions.repo';
export * from './proposals.repo';
export * from './reports.repo';
