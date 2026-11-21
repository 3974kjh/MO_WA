import { z } from 'zod';
import type { McpContext } from '../types';
import { MCP_SERVER_VERSION } from '../version';
import { ALL_MCP_TOOL_NAMES, filterToolsByScopes } from '../scopes';
import { registerAuditedTool, type ToolRegistrationContext } from './register';

export { registerAuditedTool } from './register';
export type {
	AuditedToolDefinition,
	ToolHandler,
	ToolHandlerInput,
	ToolHandlerOutcome,
	ToolRegistrationContext,
	ToolRequestMeta
} from './register';

/** Names that would appear in tools/list for this key (scope-filtered). */
export function toolsForContext(ctx: Pick<McpContext, 'scopes'>): string[] {
	return filterToolsByScopes(ALL_MCP_TOOL_NAMES, ctx);
}

function registerWhoami(reg: ToolRegistrationContext): void {
	registerAuditedTool(reg, {
		name: 'whoami',
		title: 'Who am I',
		description: '인증된 봇 이름·스코프·서버 시각을 돌려준다(연결 확인용).',
		inputSchema: {},
		outputSchema: {
			bot: z.string(),
			bot_client_id: z.string(),
			scopes: z.array(z.string()),
			auth_mode: z.string(),
			server_time: z.string(),
			version: z.string()
		},
		annotations: { readOnlyHint: true, idempotentHint: true },
		handler: async ({ ctx }) => ({
			data: {
				bot: ctx.botName,
				bot_client_id: ctx.botClientId,
				scopes: [...ctx.scopes],
				auth_mode: ctx.mode,
				server_time: new Date().toISOString(),
				version: MCP_SERVER_VERSION
			}
		})
	});
}

/** Register every implemented tool the key's scopes allow. BE-06~10 handlers land here. */
export function registerAllMcpTools(reg: ToolRegistrationContext): void {
	const allowed = new Set(toolsForContext(reg.ctx));
	if (allowed.has('whoami')) registerWhoami(reg);
}
