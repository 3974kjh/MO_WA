import { createAuditRecorder, type AuditRecorder, type RecordAuditInput } from './audit';
import { fromMcpToolError, McpToolError, mcpSuccess } from './errors';
import { sanitizeIdentityFields } from './identity';
import { assertToolScope } from './scopes';
import type {
	AuditSink,
	McpContext,
	McpRuleIssue,
	McpToolResult,
	WaitUntilFn
} from './types';

export type ToolCallMeta = {
	tool: string;
	requestId?: string | null;
	ip?: string | null;
	/** Wall-clock start; duration derived if omitted at finish. */
	startedAt?: number;
};

export type AuditedToolHandler = (input: {
	args: Record<string, unknown>;
	ctx: McpContext;
	/** Extra rule ids accumulated during the call (e.g. R-PERM-03). */
	ruleIds: string[];
}) => Promise<{
	data: Record<string, unknown>;
	warnings?: McpRuleIssue[];
	affectedIds?: string[];
	ruleIds?: string[];
}>;

/**
 * Gate a tools/call: scope check (R-PERM-04) → identity sanitize (R-PERM-03) → handler → audit.
 * Later tool tickets (BE-06+) should call this instead of writing audit rows ad hoc.
 */
export async function runAuditedToolCall(options: {
	ctx: McpContext;
	args: Record<string, unknown>;
	meta: ToolCallMeta;
	recorder: AuditRecorder;
	handler: AuditedToolHandler;
}): Promise<McpToolResult> {
	const { ctx, meta, recorder, handler } = options;
	const startedAt = meta.startedAt ?? Date.now();

	const denied = assertToolScope(ctx, meta.tool);
	if (denied) {
		recorder.record({
			ctx,
			tool: meta.tool,
			requestId: meta.requestId,
			args: options.args,
			result: 'denied',
			errorCode: 'FORBIDDEN_SCOPE',
			ruleIds: ['R-PERM-04'],
			durationMs: Date.now() - startedAt,
			ip: meta.ip
		});
		return denied;
	}

	const sanitized = sanitizeIdentityFields(options.args, ctx);
	const ruleIds = [...sanitized.ruleIds];

	try {
		const outcome = await handler({ args: sanitized.args, ctx, ruleIds });
		const allRuleIds = unique([...ruleIds, ...(outcome.ruleIds ?? [])]);
		const warnings = outcome.warnings ?? [];
		recorder.record({
			ctx,
			tool: meta.tool,
			requestId: meta.requestId,
			args: sanitized.args,
			result: 'ok',
			ruleIds: allRuleIds,
			warnings,
			affectedIds: outcome.affectedIds,
			durationMs: Date.now() - startedAt,
			ip: meta.ip
		});
		return mcpSuccess({ ...outcome.data, ...(warnings.length ? { warnings } : {}) });
	} catch (err) {
		if (err instanceof McpToolError) {
			const result: RecordAuditInput['result'] =
				err.code === 'FORBIDDEN_SCOPE' ? 'denied' : 'error';
			recorder.record({
				ctx,
				tool: meta.tool,
				requestId: meta.requestId,
				args: sanitized.args,
				result,
				errorCode: err.code,
				ruleIds: unique([...ruleIds, ...err.errors.map((e) => e.rule)]),
				durationMs: Date.now() - startedAt,
				ip: meta.ip
			});
			return fromMcpToolError(err);
		}
		recorder.record({
			ctx,
			tool: meta.tool,
			requestId: meta.requestId,
			args: sanitized.args,
			result: 'error',
			errorCode: 'INTERNAL',
			ruleIds,
			durationMs: Date.now() - startedAt,
			ip: meta.ip
		});
		throw err;
	}
}

/** Record rate_limited after auth knows the bot (BE-04 hooks here). */
export function recordRateLimited(options: {
	recorder: AuditRecorder;
	ctx: Pick<McpContext, 'botClientId' | 'ownerId'>;
	tool?: string;
	requestId?: string | null;
	ip?: string | null;
	args?: unknown;
}): void {
	options.recorder.record({
		ctx: options.ctx,
		tool: options.tool ?? '(auth)',
		requestId: options.requestId,
		args: options.args ?? {},
		result: 'rate_limited',
		errorCode: 'RATE_LIMITED',
		ip: options.ip
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
