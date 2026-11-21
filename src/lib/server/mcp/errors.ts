import type {
	McpErrorCode,
	McpErrorContent,
	McpRuleIssue,
	McpSuccessContent,
	McpToolErrorResult,
	McpToolSuccessResult
} from './types';

export class McpToolError extends Error {
	readonly code: McpErrorCode;
	readonly errors: McpRuleIssue[];

	constructor(code: McpErrorCode, errors: McpRuleIssue[], message?: string) {
		super(message ?? (errors.map((e) => e.message).join('; ') || code));
		this.name = 'McpToolError';
		this.code = code;
		this.errors = errors;
	}
}

function textPayload(data: unknown): Array<{ type: 'text'; text: string }> {
	return [{ type: 'text', text: JSON.stringify(data) }];
}

/** Success envelope (WARN allowed in structuredContent.warnings). design §5-3 */
export function mcpSuccess(data: McpSuccessContent): McpToolSuccessResult {
	const warnings = data.warnings ?? [];
	const structuredContent: McpSuccessContent = { ...data };
	if (warnings.length > 0) structuredContent.warnings = warnings;
	else delete structuredContent.warnings;
	return {
		content: textPayload(structuredContent),
		structuredContent
	};
}

/** Error envelope (isError + code + errors[]). design §5-3 */
export function mcpError(code: McpErrorCode, errors: McpRuleIssue[]): McpToolErrorResult {
	const structuredContent: McpErrorContent = { code, errors };
	return {
		isError: true,
		content: textPayload(structuredContent),
		structuredContent
	};
}

export function fromMcpToolError(err: McpToolError): McpToolErrorResult {
	return mcpError(err.code, err.errors);
}

/** R-PERM-04 — scope gate failure. */
export function forbiddenScopeError(tool: string, requiredScope: string): McpToolErrorResult {
	return mcpError('FORBIDDEN_SCOPE', [
		{
			rule: 'R-PERM-04',
			field: 'tool',
			message: `Tool '${tool}' requires scope '${requiredScope}'`
		}
	]);
}

export function validationError(errors: McpRuleIssue[]): McpToolErrorResult {
	return mcpError('VALIDATION', errors);
}

export function conflictError(errors: McpRuleIssue[]): McpToolErrorResult {
	return mcpError('CONFLICT', errors);
}

export function notFoundError(errors: McpRuleIssue[]): McpToolErrorResult {
	return mcpError('NOT_FOUND', errors);
}

export function internalError(message = 'internal error'): McpToolErrorResult {
	return mcpError('INTERNAL', [{ rule: 'R-SYS-05', message }]);
}
