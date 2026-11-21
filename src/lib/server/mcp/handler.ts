import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { RepoClient } from '$lib/server/repo';
import type { AuditRecorder } from './audit';
import type { McpContext } from './types';
import { registerAllMcpTools } from './tools';
import type { ToolRequestMeta } from './tools/register';
import { MCP_SERVER_VERSION } from './version';

export { MCP_SERVER_VERSION };

export type HandleMcpOptions = {
	repo?: RepoClient | null;
	recorder: AuditRecorder;
	meta?: ToolRequestMeta;
	logError?: (message: string) => void;
};

/** stateless: 요청마다 서버·transport를 새로 만든다 (Workers isolate 간 상태 공유 없음) */
export async function handleMcp(
	request: Request,
	ctx: McpContext,
	options: HandleMcpOptions
): Promise<Response> {
	const server = new McpServer(
		{ name: 'mo-wa', version: MCP_SERVER_VERSION },
		{ capabilities: { tools: {} } }
	);
	registerAllMcpTools({
		server,
		ctx,
		repo: options.repo ?? null,
		recorder: options.recorder,
		metaBase: options.meta ?? {},
		logError: options.logError
	});
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true
	});
	await server.connect(transport);
	return transport.handleRequest(request);
}
