import { forbiddenScopeError } from './errors';
import type { McpContext, McpToolErrorResult } from './types';

/**
 * Tool → required scope mapping (design §5-2).
 * Incomplete until BE-06+ registers tools; unknown tools require `read` as a safe default
 * only when explicitly listed. Unmapped tools are treated as out of catalog → denied.
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
	upsert_report: 'reports:daily_brief', // kind-specific refinement is BE-07
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

export function requiredScopeForTool(tool: string): string | null {
	return TOOL_REQUIRED_SCOPE[tool] ?? null;
}

export function hasScope(ctx: Pick<McpContext, 'scopes'>, scope: string): boolean {
	return ctx.scopes.includes(scope) || ctx.scopes.includes('import:all');
}

/**
 * R-PERM-04: out-of-scope or unknown tool → FORBIDDEN_SCOPE (MCP isError, not HTTP 403).
 * Returns null when allowed.
 */
export function assertToolScope(
	ctx: Pick<McpContext, 'scopes'>,
	tool: string
): McpToolErrorResult | null {
	const required = requiredScopeForTool(tool);
	if (required === null) {
		return forbiddenScopeError(tool, '(unregistered)');
	}
	if (!hasScope(ctx, required)) {
		return forbiddenScopeError(tool, required);
	}
	return null;
}
