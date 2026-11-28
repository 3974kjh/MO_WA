import type { McpContext } from '../types';
import { ALL_MCP_TOOL_NAMES, filterToolsByScopes } from '../scopes';
import { registerFeedTools } from './feed';
import { registerJournalTools } from './journal';
import { registerMarketTools } from './market';
import { registerPortfolioTools } from './portfolio';
import { registerPrincipleTools } from './principles';
import { registerReadTools } from './read';
import { registerReportsTools } from './reports';
import type { ToolRegistrationContext } from './register';

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

/** Register every implemented tool the key's scopes allow (BE-06~BE-10 / BE-17). */
export function registerAllMcpTools(reg: ToolRegistrationContext): void {
	registerReadTools(reg);
	registerPortfolioTools(reg);
	registerPrincipleTools(reg);
	registerReportsTools(reg);
	registerJournalTools(reg);
	registerMarketTools(reg);
	registerFeedTools(reg);
}
