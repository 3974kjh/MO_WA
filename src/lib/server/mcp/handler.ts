import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { McpContext } from './auth';
import { registerSpikeTools } from './tools';

export const MCP_SERVER_VERSION = '0.1.0-spike';

/** stateless: 요청마다 서버·transport를 새로 만든다 (Workers isolate 간 상태 공유 없음) */
export async function handleMcp(request: Request, ctx: McpContext): Promise<Response> {
	const server = new McpServer({ name: 'mo-wa', version: MCP_SERVER_VERSION }, { capabilities: { tools: {} } });
	registerSpikeTools(server, ctx);
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true
	});
	await server.connect(transport);
	return transport.handleRequest(request);
}
