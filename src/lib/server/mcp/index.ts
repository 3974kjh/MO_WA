/** BE-05: MCP audit log + response contract. Auth DB mode is BE-04 (not included). */

export {
	assertPreviewHasNoRawBody,
	BEARER_SECRET_RE,
	buildArgsPreview,
	createAuditRecorder,
	createImmediateWaitUntil,
	createMemoryAuditSink,
	DANGEROUS_KEYS,
	digestArgs,
	isSecretKeyName,
	JWT_VALUE_RE,
	looksLikeSecretValue,
	maskSecretsForDigest,
	maskSecretsInString,
	MCP_KEY_VALUE_RE,
	normalizeKey,
	platformWaitUntil,
	previewOrRedacted,
	redactArgs,
	redactArgsForPreview,
	safeArgsPreview,
	stableStringify,
	toSnakeLower,
	type AuditRecorder,
	type CreateAuditRecorderOptions,
	type RecordAuditInput
} from './audit';
export { isOwnerScopedDisplayId, mowaDisplayId, type DisplayIdPrefix } from './display-id';
export {
	conflictError,
	errorCodeToAuditResult,
	forbiddenScopeError,
	fromMcpToolError,
	internalError,
	mcpError,
	mcpSuccess,
	McpToolError,
	notFoundError,
	redactedErrorMessage,
	validationError
} from './errors';
export {
	botProposalIdentity,
	identityValuesDiffer,
	IMPERSONATION_KEYS,
	isIdentityKey,
	sanitizeIdentityFields,
	type ImpersonationKey,
	type SanitizeIdentityResult
} from './identity';
export {
	assertToolScope,
	hasScope,
	importAllUnlocksTool,
	PRINCIPLES_WRITE_TOOLS,
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
	McpAffectedId,
	McpAuditLogRow,
	McpAuditResult,
	McpAuthProvider,
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
