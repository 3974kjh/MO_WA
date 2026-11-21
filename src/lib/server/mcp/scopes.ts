import { forbiddenScopeError } from './errors';
import type { McpContext, McpToolErrorResult } from './types';

/**
 * Tool → required scope mapping (design §5-2 / §5-5).
 * No inventing `import_legacy_*` tools — I-7 uses existing write tools + `import:all` key.
 *
 * BE-04 note: profile=importer + mandatory expiry, and migration-mode wiring for
 * `import:all` keys, belong to BE-04 auth / BE-03 validation — not implemented here.
 */
export const TOOL_REQUIRED_SCOPE: Readonly<Record<string, string>> = {
	whoami: 'read',
	get_dashboard_context: 'read',
	get_report: 'read',
	list_reports: 'read',
	search: 'read',
	list_instruments: 'read',
	list_positions: 'read',
	list_proposals: 'read',
	list_journal_entries: 'read',
	list_decisions: 'read',
	list_events: 'read',
	list_principle_proposals: 'read',
	upsert_report: 'reports:daily_brief',
	archive_report: 'reports:daily_brief',
	propose_position_change: 'positions:propose',
	cancel_proposal: 'positions:propose',
	create_planned_position: 'positions:annotate',
	update_position_reference: 'positions:annotate',
	propose_principle_change: 'principles:propose',
	cancel_principle_proposal: 'principles:propose',
	add_journal_entry: 'journal:write',
	update_journal_entry: 'journal:write',
	archive_journal_entry: 'journal:write'
};

/**
 * Live proposal-queue tools — finance-manager only (`positions:propose` / `principles:propose`).
 * `import:all` must NOT unlock these (do not migrate holdings via the proposal queue).
 */
export const PROPOSAL_TOOLS = new Set([
	'propose_position_change',
	'cancel_proposal',
	'propose_principle_change',
	'cancel_principle_proposal'
]);

/** @deprecated alias — prefer PROPOSAL_TOOLS (principles subset of proposal tools). */
export const PRINCIPLES_WRITE_TOOLS = new Set([
	'propose_principle_change',
	'cancel_principle_proposal'
]);

export function requiredScopeForTool(tool: string): string | null {
	return TOOL_REQUIRED_SCOPE[tool] ?? null;
}

export function hasScope(ctx: Pick<McpContext, 'scopes'>, scope: string): boolean {
	return ctx.scopes.includes(scope);
}

/**
 * Whether `import:all` may unlock this tool (I-7 migration via existing write tools).
 * Not a wildcard: proposal tools (positions + principles) stay excluded.
 */
export function importAllUnlocksTool(tool: string): boolean {
	return !PROPOSAL_TOOLS.has(tool);
}

/**
 * R-PERM-04: out-of-scope or unknown tool → FORBIDDEN_SCOPE.
 * `import:all` unlocks §5-5 write/read tools except live proposal tools.
 */
export function assertToolScope(
	ctx: Pick<McpContext, 'scopes'>,
	tool: string
): McpToolErrorResult | null {
	const required = requiredScopeForTool(tool);
	if (required === null) {
		return forbiddenScopeError(tool, '(unregistered)');
	}
	if (hasScope(ctx, required)) {
		return null;
	}
	if (hasScope(ctx, 'import:all') && importAllUnlocksTool(tool)) {
		return null;
	}
	return forbiddenScopeError(tool, required);
}
