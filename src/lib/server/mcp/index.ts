/** BE-05: MCP audit log + response contract. Auth DB mode is BE-04 (not included). */

export {
	assertPreviewHasNoRawBody,
	buildArgsPreview,
	createAuditRecorder,
	createImmediateWaitUntil,
	createMemoryAuditSink,
	digestArgs,
	platformWaitUntil,
	stableStringify,
	type AuditRecorder,
	type CreateAuditRecorderOptions,
	type RecordAuditInput
} from './audit';
export {
	createStubAuthProvider,
	createStubMcpContext,
	type McpAuthProvider
} from './context';
export { isOwnerScopedDisplayId, mowaDisplayId, type DisplayIdPrefix } from './display-id';
export {
	conflictError,
	forbiddenScopeError,
	fromMcpToolError,
	internalError,
	mcpError,
	mcpSuccess,
	McpToolError,
	notFoundError,
	validationError
} from './errors';
export {
	IMPERSONATION_KEYS,
	sanitizeIdentityFields,
	type ImpersonationKey,
	type SanitizeIdentityResult
} from './identity';
export {
	assertToolScope,
	hasScope,
	requiredScopeForTool,
	TOOL_REQUIRED_SCOPE
} from './scopes';
export {
	createDefaultToolAudit,
	recordRateLimited,
	runAuditedToolCall,
	type AuditedToolHandler,
	type ToolCallMeta
} from './tool-gate';
export type {
	AuditSink,
	McpActorType,
	McpAuditLogRow,
	McpAuditResult,
	McpContext,
	McpErrorCode,
	McpErrorContent,
	McpRuleIssue,
	McpSuccessContent,
	McpToolErrorResult,
	McpToolResult,
	McpToolSuccessResult,
	WaitUntilFn
} from './types';
