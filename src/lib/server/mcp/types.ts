/**
 * Shared MCP types for BE-05 (audit + response contract).
 * Auth DB mode (BE-04) is out of scope — consumers inject or stub McpContext.
 */

/** Authenticated bot context. BE-04 fills this from mcp_authenticate; tests stub it. */
export type McpContext = {
	botClientId: string;
	ownerId: string;
	profile: string;
	scopes: readonly string[];
	/** Optional display name for logs; not required by design §5-2. */
	botName?: string;
};

export type McpActorType = 'bot' | 'user' | 'system';

/** tools/call audit outcomes (design §5-6 / BE-05 acceptance). */
export type McpAuditResult = 'ok' | 'error' | 'denied' | 'rate_limited';

export type McpErrorCode =
	| 'VALIDATION'
	| 'FORBIDDEN_SCOPE'
	| 'NOT_FOUND'
	| 'CONFLICT'
	| 'RATE_LIMITED'
	| 'PAYLOAD_TOO_LARGE'
	| 'INTERNAL';

export type McpRuleIssue = {
	rule: string;
	field?: string;
	message: string;
};

export type McpSuccessContent = Record<string, unknown> & {
	warnings?: McpRuleIssue[];
};

export type McpErrorContent = {
	code: McpErrorCode;
	errors: McpRuleIssue[];
};

/** MCP tool result shape (design §5-3). */
export type McpToolSuccessResult = {
	isError?: false;
	content: Array<{ type: 'text'; text: string }>;
	structuredContent: McpSuccessContent;
};

export type McpToolErrorResult = {
	isError: true;
	content: Array<{ type: 'text'; text: string }>;
	structuredContent: McpErrorContent;
};

export type McpToolResult = McpToolSuccessResult | McpToolErrorResult;

/** Row written to mcp_audit_log (R-SYS-05). No SQL migration here — BE-01 owns schema. */
export type McpAuditLogRow = {
	actor_type: McpActorType;
	bot_client_id: string | null;
	owner_id: string | null;
	tool: string;
	request_id: string | null;
	args_digest: string;
	args_preview: Record<string, unknown>;
	result: McpAuditResult;
	error_code: McpErrorCode | null;
	rule_ids: string[];
	warnings: McpRuleIssue[];
	affected_ids: string[];
	duration_ms: number | null;
	ip: string | null;
};

export type AuditSink = {
	insert(row: McpAuditLogRow): Promise<void>;
};

/** Cloudflare `ctx.waitUntil` compatible; tests inject a sync collector. */
export type WaitUntilFn = (promise: Promise<unknown>) => void;
