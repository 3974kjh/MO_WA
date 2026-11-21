/**
 * Repository public API.
 *
 * M-4: db lives only in a module-internal WeakMap — never exported.
 * Do not import repo/client or botIdentityBrand from outside repo/mcp auth
 * (ESLint). Mint branded bot identity via $lib/server/mcp/auth (BE-04).
 * M-5: Do not call runRules from create/update paths.
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
