import { createAuditRecorder, type AuditRecorder } from './audit';
import {
	errorCodeToAuditResult,
	fromMcpToolError,
	internalError,
	McpToolError,
	mcpSuccess,
	redactedErrorMessage
} from './errors';
import { sanitizeIdentityFields } from './identity';
import { assertToolScope } from './scopes';
import type {
	AuditSink,
	McpAffectedId,
	McpContext,
	McpRuleIssue,
	McpToolResult,
	WaitUntilFn
} from './types';

export type ToolCallMeta = {
	tool: string;
	requestId?: string | null;
	ip?: string | null;
	userAgent?: string | null;
	userId?: string | null;
	startedAt?: number;
};

export type AuditedToolHandler = (input: {
	/** Identity fields already stripped — use ctx for owner/bot ids. */
	args: Record<string, unknown>;
	ctx: McpContext;
	ruleIds: string[];
}) => Promise<{
	data: Record<string, unknown>;
	warnings?: McpRuleIssue[];
	affectedIds?: McpAffectedId[];
	ruleIds?: string[];
}>;

function collectWarnings(
	data: Record<string, unknown>,
	explicit?: McpRuleIssue[]
): McpRuleIssue[] {
	const fromData = Array.isArray(data.warnings) ? (data.warnings as McpRuleIssue[]) : [];
	return [...(explicit ?? []), ...fromData].filter((w) => w && typeof w.rule === 'string');
}

/**
 * Gate a tools/call: identity sanitize → scope check → handler → audit.
 * Later tool tickets (BE-06+) should call this instead of writing audit rows ad hoc.
 */
export async function runAuditedToolCall(options: {
	ctx: McpContext;
	args: Record<string, unknown>;
	meta: ToolCallMeta;
	recorder: AuditRecorder;
	handler: AuditedToolHandler;
	/** Optional server logger; receives redacted messages only (M-5). */
	logError?: (message: string) => void;
}): Promise<McpToolResult> {
	const { ctx, meta, recorder, handler } = options;
	const startedAt = meta.startedAt ?? Date.now();

	// L-4 / L-5: strip identity first so denied and ok paths share digest input + R-PERM-03.
	const sanitized = sanitizeIdentityFields(options.args, ctx);
	const identityRuleIds = [...sanitized.ruleIds];

	const denied = assertToolScope(ctx, meta.tool);
	if (denied) {
		recorder.record({
			ctx,
			userId: meta.userId,
			tool: meta.tool,
			requestId: meta.requestId,
			args: sanitized.args,
			result: 'denied',
			errorCode: 'FORBIDDEN_SCOPE',
			ruleIds: unique(['R-PERM-04', ...identityRuleIds]),
			durationMs: Date.now() - startedAt,
			ip: meta.ip,
			userAgent: meta.userAgent
		});
		return denied;
	}

	try {
		const outcome = await handler({ args: sanitized.args, ctx, ruleIds: identityRuleIds });
		const warnings = collectWarnings(outcome.data, outcome.warnings); // L-1
		const allRuleIds = unique([
			...identityRuleIds,
			...(outcome.ruleIds ?? []),
			...warnings.map((w) => w.rule)
		]);
		recorder.record({
			ctx,
			userId: meta.userId,
			tool: meta.tool,
			requestId: meta.requestId,
			args: sanitized.args,
			result: 'ok',
			ruleIds: allRuleIds,
			warnings,
			affectedIds: outcome.affectedIds,
			durationMs: Date.now() - startedAt,
			ip: meta.ip,
			userAgent: meta.userAgent
		});
		const { warnings: _drop, ...dataWithoutDup } = outcome.data;
		void _drop;
		return mcpSuccess({
			...dataWithoutDup,
			...(warnings.length ? { warnings } : {})
		});
	} catch (err) {
		if (err instanceof McpToolError) {
			const result = errorCodeToAuditResult(err.code); // M-2
			recorder.record({
				ctx,
				userId: meta.userId,
				tool: meta.tool,
				requestId: meta.requestId,
				args: sanitized.args,
				result,
				errorCode: err.code,
				ruleIds: unique([
					...identityRuleIds,
					...err.errors.map((e) => e.rule)
				]),
				durationMs: Date.now() - startedAt,
				ip: meta.ip,
				userAgent: meta.userAgent
			});
			return fromMcpToolError(err);
		}

		// M-5: never rethrow to the client — internalError envelope only.
		const redacted = redactedErrorMessage(err);
		options.logError?.(redacted);
		recorder.record({
			ctx,
			userId: meta.userId,
			tool: meta.tool,
			requestId: meta.requestId,
			args: sanitized.args,
			result: 'error',
			errorCode: 'INTERNAL',
			ruleIds: identityRuleIds,
			durationMs: Date.now() - startedAt,
			ip: meta.ip,
			userAgent: meta.userAgent
		});
		return internalError('internal error');
	}
}

/** Record rate_limited after auth knows the bot (BE-04 hooks here). */
export function recordRateLimited(options: {
	recorder: AuditRecorder;
	ctx: Pick<McpContext, 'botClientId' | 'ownerId'>;
	tool?: string;
	requestId?: string | null;
	ip?: string | null;
	userAgent?: string | null;
	args?: unknown;
}): void {
	options.recorder.record({
		ctx: options.ctx,
		tool: options.tool ?? '(auth)',
		requestId: options.requestId,
		args: options.args ?? {},
		result: 'rate_limited',
		errorCode: 'RATE_LIMITED',
		ip: options.ip,
		userAgent: options.userAgent
	});
}

export function createDefaultToolAudit(options: {
	sink: AuditSink;
	waitUntil: WaitUntilFn;
}): AuditRecorder {
	return createAuditRecorder(options);
}

function unique(values: string[]): string[] {
	return [...new Set(values.filter(Boolean))];
}
