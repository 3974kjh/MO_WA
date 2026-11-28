import { createAuditRecorder, type AuditRecorder } from './audit';
import {
	errorCodeToAuditResult,
	fromMcpToolError,
	internalError,
	mcpError,
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
	args: Record<string, unknown>;
	ctx: McpContext;
	ruleIds: string[];
	/**
	 * Store an audit row BEFORE the handler writes data (fail-closed): rejects with an
	 * McpToolError when the audit row cannot be stored, so the handler must not write.
	 */
	auditIntent: (notes: McpRuleIssue[]) => Promise<void>;
}) => Promise<{
	data: Record<string, unknown>;
	warnings?: McpRuleIssue[];
	affectedIds?: McpAffectedId[];
	ruleIds?: string[];
	/** Recorded in mcp_audit_log.warnings only — never returned to the caller (e.g. feed summary). */
	auditNotes?: McpRuleIssue[];
	/** Await the final audit row; a failed audit write turns the call into an explicit error. */
	auditRequired?: boolean;
}>;

function collectWarnings(data: Record<string, unknown>, explicit?: McpRuleIssue[]): McpRuleIssue[] {
	const fromData = Array.isArray(data.warnings) ? (data.warnings as McpRuleIssue[]) : [];
	return [...(explicit ?? []), ...fromData].filter((w) => w && typeof w.rule === 'string');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Gate a tools/call: identity sanitize → scope check → handler → audit.
 */
export async function runAuditedToolCall(options: {
	ctx: McpContext;
	args: Record<string, unknown>;
	meta: ToolCallMeta;
	recorder: AuditRecorder;
	handler: AuditedToolHandler;
	logError?: (message: string) => void;
}): Promise<McpToolResult> {
	const { ctx, meta, recorder, handler } = options;
	const startedAt = meta.startedAt ?? Date.now();

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
		const auditIntent = async (notes: McpRuleIssue[]) => {
			try {
				await recorder.recordSync({
					ctx,
					userId: meta.userId,
					// Distinct tool name so per-tool ok/error stats are not double counted when the
					// write later fails (the real outcome row keeps the plain tool name).
					tool: `${meta.tool}:intent`,
					requestId: meta.requestId,
					args: sanitized.args,
					result: 'ok',
					// R-FEED-31 lives in warnings only (not rule_ids): rule stats and the
					// "has warnings" filter key off rule_ids, so a successful intent row must not pollute them.
					ruleIds: unique(identityRuleIds),
					warnings: notes,
					durationMs: Date.now() - startedAt,
					ip: meta.ip,
					userAgent: meta.userAgent
				});
			} catch {
				options.logError?.(`mcp_audit_alert: pre-write audit failed tool=${meta.tool}`);
				throw new McpToolError('INTERNAL', [
					{
						rule: 'R-FEED-32',
						message: 'audit log unavailable; nothing was written. Retry later.'
					}
				]);
			}
		};
		const outcome = await handler({
			args: sanitized.args,
			ctx,
			ruleIds: identityRuleIds,
			auditIntent
		});
		const warnings = collectWarnings(outcome.data, outcome.warnings);
		const auditNotes = (outcome.auditNotes ?? []).filter((w) => w && typeof w.rule === 'string');
		const allRuleIds = unique([
			...identityRuleIds,
			...(outcome.ruleIds ?? []),
			...warnings.map((w) => w.rule)
		]).filter((id) => id !== 'R-FEED-30' && id !== 'R-FEED-31');
		const okRow = {
			ctx,
			userId: meta.userId,
			tool: meta.tool,
			requestId: meta.requestId,
			args: sanitized.args,
			result: 'ok' as const,
			ruleIds: allRuleIds,
			warnings: [...warnings, ...auditNotes],
			affectedIds: outcome.affectedIds,
			durationMs: Date.now() - startedAt,
			ip: meta.ip,
			userAgent: meta.userAgent
		};
		if (outcome.auditRequired) {
			try {
				await recorder.recordSync(okRow);
			} catch {
				// Data is already written; do NOT report plain success.
				options.logError?.(`mcp_audit_alert: final audit failed after write tool=${meta.tool}`);
				return mcpError('INTERNAL', [
					{
						rule: 'R-FEED-32',
						message:
							'data was written but the audit record failed; resend the same feed_id to confirm (idempotent)'
					}
				]);
			}
		} else {
			recorder.record(okRow);
		}
		const { warnings: _drop, ...dataWithoutDup } = outcome.data;
		void _drop;
		return mcpSuccess({
			...dataWithoutDup,
			...(warnings.length ? { warnings } : {})
		});
	} catch (err) {
		if (err instanceof McpToolError) {
			const result = errorCodeToAuditResult(err.code);
			recorder.record({
				ctx,
				userId: meta.userId,
				tool: meta.tool,
				requestId: meta.requestId,
				args: sanitized.args,
				result,
				errorCode: err.code,
				ruleIds: unique([...identityRuleIds, ...err.errors.map((e) => e.rule)]),
				...(err.auditNotes?.length ? { warnings: err.auditNotes } : {}),
				durationMs: Date.now() - startedAt,
				ip: meta.ip,
				userAgent: meta.userAgent
			});
			return fromMcpToolError(err);
		}

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

/**
 * Record rate_limited after auth knows the bot (BE-04 hooks here).
 * Same identity-strip + mask pipeline as other paths — owner_id must not remain in preview.
 */
export function recordRateLimited(options: {
	recorder: AuditRecorder;
	ctx: Pick<McpContext, 'botClientId' | 'ownerId'>;
	tool?: string;
	requestId?: string | null;
	ip?: string | null;
	userAgent?: string | null;
	args?: unknown;
}): void {
	const raw = isPlainObject(options.args) ? options.args : {};
	const sanitized = sanitizeIdentityFields(raw, options.ctx);
	options.recorder.record({
		ctx: options.ctx,
		tool: options.tool ?? '(auth)',
		requestId: options.requestId,
		args: sanitized.args,
		result: 'rate_limited',
		errorCode: 'RATE_LIMITED',
		ruleIds: sanitized.ruleIds,
		ip: options.ip,
		userAgent: options.userAgent
	});
}

export function createDefaultToolAudit(options: {
	sink: AuditSink;
	waitUntil: WaitUntilFn;
	onError?: (err: unknown) => void;
}): AuditRecorder {
	return createAuditRecorder(options);
}

function unique(values: string[]): string[] {
	return [...new Set(values.filter(Boolean))];
}
