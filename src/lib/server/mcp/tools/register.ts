import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';
import type { RepoClient } from '$lib/server/repo';
import type { AuditRecorder } from '../audit';
import { runAuditedToolCall, type AuditedToolHandler } from '../tool-gate';
import type { McpAffectedId, McpContext, McpRuleIssue } from '../types';

export type ToolRequestMeta = {
	requestId?: string | null;
	ip?: string | null;
	userAgent?: string | null;
	userId?: string | null;
};

export type ToolRegistrationContext = {
	server: McpServer;
	ctx: McpContext;
	repo: RepoClient | null;
	recorder: AuditRecorder;
	metaBase: ToolRequestMeta;
	logError?: (message: string) => void;
};

export type ToolHandlerInput = {
	args: Record<string, unknown>;
	ctx: McpContext;
	ruleIds: string[];
	repo: RepoClient | null;
};

export type ToolHandlerOutcome = {
	data: Record<string, unknown>;
	warnings?: McpRuleIssue[];
	affectedIds?: McpAffectedId[];
	ruleIds?: string[];
};

export type ToolHandler = (input: ToolHandlerInput) => Promise<ToolHandlerOutcome>;

export type AuditedToolDefinition = {
	name: string;
	title: string;
	description: string;
	inputSchema: Record<string, z.ZodType>;
	outputSchema?: Record<string, z.ZodType>;
	annotations?: {
		readOnlyHint?: boolean;
		destructiveHint?: boolean;
		idempotentHint?: boolean;
		openWorldHint?: boolean;
	};
	handler: ToolHandler;
};

function joinRequestId(rpcId: string | number | undefined, base?: string | null): string | null {
	const parts = [rpcId === undefined ? null : String(rpcId), base ?? null].filter(
		(p): p is string => Boolean(p)
	);
	return parts.length ? parts.join(':') : null;
}

/** Register a tool whose every call runs through runAuditedToolCall (scope + audit + error envelope). */
export function registerAuditedTool(
	reg: ToolRegistrationContext,
	def: AuditedToolDefinition
): void {
	const { server, ctx, repo, recorder, metaBase, logError } = reg;
	const handler: AuditedToolHandler = (input) => def.handler({ ...input, repo });

	server.registerTool(
		def.name,
		{
			title: def.title,
			description: def.description,
			inputSchema: def.inputSchema,
			...(def.outputSchema ? { outputSchema: def.outputSchema } : {}),
			...(def.annotations ? { annotations: def.annotations } : {})
		},
		(async (args: unknown, extra?: { requestId?: string | number }) =>
			runAuditedToolCall({
				ctx,
				args: (args && typeof args === 'object' ? args : {}) as Record<string, unknown>,
				meta: {
					tool: def.name,
					requestId: joinRequestId(extra?.requestId, metaBase.requestId),
					ip: metaBase.ip,
					userAgent: metaBase.userAgent,
					userId: metaBase.userId
				},
				recorder,
				handler,
				logError
			})) as never
	);
}
