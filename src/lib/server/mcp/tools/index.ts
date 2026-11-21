import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { pingDatabase } from '$lib/server/repo';
import type { McpContext } from '../auth';
import { MCP_SERVER_VERSION } from '../handler';

const ok = <T extends Record<string, unknown>>(data: T) => ({
	content: [{ type: 'text' as const, text: JSON.stringify(data) }],
	structuredContent: data
});

export function registerSpikeTools(server: McpServer, ctx: McpContext) {
	server.registerTool(
		'whoami',
		{
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
			annotations: { readOnlyHint: true, idempotentHint: true }
		},
		async () =>
			ok({
				bot: ctx.botName,
				bot_client_id: ctx.botClientId,
				scopes: ctx.scopes,
				auth_mode: ctx.mode,
				server_time: new Date().toISOString(),
				version: MCP_SERVER_VERSION
			})
	);

	server.registerTool(
		'echo',
		{
			title: 'Echo',
			description: '입력 검증(zod) 동작 확인용. message를 그대로 돌려준다.',
			inputSchema: { message: z.string().min(1).max(200) },
			outputSchema: { message: z.string(), length: z.number() },
			annotations: { readOnlyHint: true, idempotentHint: true }
		},
		async ({ message }) => ok({ message, length: message.length })
	);

	server.registerTool(
		'db_ping',
		{
			title: 'Supabase ping (read-only)',
			description: 'Workers→Supabase(PostgREST) 왕복 지연을 잰다. 쓰기 없음: profiles head count만 조회.',
			inputSchema: {},
			outputSchema: { ok: z.boolean(), latency_ms: z.number(), error: z.string().optional() },
			annotations: { readOnlyHint: true, idempotentHint: true }
		},
		async () => ok(await pingDatabase())
	);
}
