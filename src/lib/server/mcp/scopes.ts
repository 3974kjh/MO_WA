import { forbiddenScopeError } from './errors';
import type { McpContext, McpToolErrorResult } from './types';

const REPORT_WRITE_SCOPES = [
	'reports:daily_brief',
	'reports:weekly_report',
	'reports:strategy',
	'reports:equity_analysis',
	'reports:buy_plan_draft',
	'reports:realestate_brief',
	'reports:realestate_analysis'
] as const;

const EVENT_WRITE_SCOPES = ['events:stock', 'events:macro', 'events:realestate'] as const;

/** Sentinel: "any report write scope" (not a real scope string a key can hold). */
export const REPORT_WRITE_SENTINEL = 'reports:*';
/** Sentinel: "any events:* domain scope". */
export const EVENT_WRITE_SENTINEL = 'events:*';

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
	list_principle_proposals: 'principles:propose',
	upsert_report: REPORT_WRITE_SENTINEL,
	archive_report: REPORT_WRITE_SENTINEL,
	upsert_instrument: 'instruments:write',
	create_planned_position: 'positions:annotate',
	update_position_reference: 'positions:annotate',
	propose_position_change: 'positions:propose',
	cancel_proposal: 'positions:propose',
	propose_principle_change: 'principles:propose',
	cancel_principle_proposal: 'principles:propose',
	add_journal_entry: 'journal:write',
	update_journal_entry: 'journal:write',
	archive_journal_entry: 'journal:write',
	record_price_snapshots: 'prices:write',
	record_portfolio_snapshot: 'portfolio:snapshot',
	record_market_indicators: 'indicators:write',
	submit_daily_market_feed: 'market:feed',
	upsert_decision: 'decisions:write',
	archive_decision: 'decisions:write',
	upsert_event: EVENT_WRITE_SENTINEL,
	archive_event: EVENT_WRITE_SENTINEL
};

/**
 * Tools unlocked by any one of several scopes (handler narrows further:
 * report kind → REPORT_KIND_TO_SCOPE, instrument enrich fields, event domain).
 * Exported for operator docs (BE-14) — must stay aligned with assertToolScope.
 */
export const TOOL_ANY_OF_SCOPES: Readonly<Record<string, readonly string[]>> = {
	upsert_report: REPORT_WRITE_SCOPES,
	archive_report: REPORT_WRITE_SCOPES,
	upsert_instrument: ['instruments:write', 'instruments:enrich'],
	upsert_event: EVENT_WRITE_SCOPES,
	archive_event: EVENT_WRITE_SCOPES
};

/** Every tool name registered in the MCP surface (scope-filtered by tools/list). */
export const ALL_MCP_TOOL_NAMES: readonly string[] = Object.freeze(
	Object.keys(TOOL_REQUIRED_SCOPE)
);

/** @deprecated M1 spike set — echo / db_ping were removed; whoami only. */
export const SPIKE_TOOL_NAMES = ['whoami'] as const;

/** report kind (or `buy_plan` pseudo-kind for equity_analysis/subtype=buy_plan) → write scope. */
export const REPORT_KIND_TO_SCOPE: Readonly<Record<string, string>> = {
	daily_brief: 'reports:daily_brief',
	weekly_report: 'reports:weekly_report',
	strategy: 'reports:strategy',
	equity_analysis: 'reports:equity_analysis',
	buy_plan: 'reports:buy_plan_draft',
	realestate_brief: 'reports:realestate_brief',
	realestate_analysis: 'reports:realestate_analysis'
};

/** tools/list filter: tools the key's scopes may see. */
export function filterToolsByScopes(
	toolNames: readonly string[],
	ctx: Pick<McpContext, 'scopes'>
): string[] {
	return toolNames.filter((name) => assertToolScope(ctx, name) === null);
}

/**
 * Live proposal-queue tools — finance-manager only (`positions:propose` / `principles:propose`).
 * `import:all` must NOT unlock these (do not migrate holdings via the proposal queue).
 */
export const PROPOSAL_TOOLS = new Set([
	'propose_position_change',
	'cancel_proposal',
	'propose_principle_change',
	'cancel_principle_proposal',
	'list_principle_proposals'
]);

/**
 * Daily market feed tool (mcp-feed-design §2 / §3-1). Opened only by `market:feed`;
 * `import:all` must NOT unlock it (feed gates assume a dedicated, narrow key).
 */
export const FEED_TOOLS = new Set(['submit_daily_market_feed']);

/** @deprecated alias — prefer PROPOSAL_TOOLS (principles subset of proposal tools). */
export const PRINCIPLES_WRITE_TOOLS = new Set([
	'propose_principle_change',
	'cancel_principle_proposal',
	'list_principle_proposals'
]);

export function requiredScopeForTool(tool: string): string | null {
	return Object.hasOwn(TOOL_REQUIRED_SCOPE, tool) ? (TOOL_REQUIRED_SCOPE[tool] ?? null) : null;
}

export function hasScope(ctx: Pick<McpContext, 'scopes'>, scope: string): boolean {
	return ctx.scopes.includes(scope);
}

/**
 * Whether `import:all` may unlock this tool (I-7 migration via existing write tools).
 * Not a wildcard: proposal tools (positions + principles) and the daily feed stay excluded.
 */
export function importAllUnlocksTool(tool: string): boolean {
	return !PROPOSAL_TOOLS.has(tool) && !FEED_TOOLS.has(tool);
}

/** Scopes that allow at least one report kind write (principles are never writable). */
export const REPORT_WRITE_SCOPE_LIST: readonly string[] = REPORT_WRITE_SCOPES;

export function hasReportWriteScope(ctx: Pick<McpContext, 'scopes'>): boolean {
	return REPORT_WRITE_SCOPES.some((scope) => hasScope(ctx, scope));
}

/** Scope needed to write this report kind; null for kinds with no bot write scope (principles). */
export function scopeForReportKind(kind: string, subtype?: string | null): string | null {
	if (kind === 'equity_analysis' && subtype === 'buy_plan') {
		return REPORT_KIND_TO_SCOPE.buy_plan;
	}
	if (!Object.hasOwn(REPORT_KIND_TO_SCOPE, kind) || kind === 'buy_plan') return null;
	return REPORT_KIND_TO_SCOPE[kind] ?? null;
}

/**
 * Handler-level check after the tool gate: the key must hold the scope for this
 * specific kind/subtype (`import:all` also passes, except principles).
 */
export function assertReportKindScope(
	ctx: Pick<McpContext, 'scopes'>,
	kind: string,
	subtype?: string | null
): McpToolErrorResult | null {
	const required = scopeForReportKind(kind, subtype);
	if (required === null) {
		return forbiddenScopeError(`report:${kind}`, '(no write scope for this kind)');
	}
	if (hasScope(ctx, required) || hasScope(ctx, 'import:all')) return null;
	return forbiddenScopeError(`report:${kind}`, required);
}

function requiredLabel(tool: string): string {
	const anyOf = TOOL_ANY_OF_SCOPES[tool];
	return anyOf ? anyOf.join('|') : (requiredScopeForTool(tool) ?? '(unregistered)');
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
	const anyOf = TOOL_ANY_OF_SCOPES[tool];
	if (anyOf ? anyOf.some((scope) => hasScope(ctx, scope)) : hasScope(ctx, required)) {
		return null;
	}
	if (hasScope(ctx, 'import:all') && importAllUnlocksTool(tool)) {
		return null;
	}
	return forbiddenScopeError(tool, requiredLabel(tool));
}
