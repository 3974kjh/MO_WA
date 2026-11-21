import { describe, expect, it } from 'vitest';
import { createAuditRecorder, createImmediateWaitUntil, createMemoryAuditSink } from './audit';
import { handleMcp } from './handler';
import { createStubMcpContext } from './testing';

async function rpc(scopes: string[], method: string, params: Record<string, unknown> = {}) {
	const sink = createMemoryAuditSink();
	const recorder = createAuditRecorder({ sink, waitUntil: createImmediateWaitUntil() });
	const request = new Request('https://mo-wa.pages.dev/api/mcp', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream'
		},
		body: JSON.stringify({ jsonrpc: '2.0', id: 7, method, params })
	});
	const res = await handleMcp(request, createStubMcpContext({ scopes }), {
		recorder,
		meta: { requestId: 'ray-1', ip: '1.2.3.4', userAgent: 'vitest' }
	});
	await recorder.drain();
	return { body: await res.json(), rows: sink.rows };
}

describe('handleMcp whoami through runAuditedToolCall', () => {
	it('tools/list shows only whoami for a read key (no echo/db_ping)', async () => {
		const { body, rows } = await rpc(['read'], 'tools/list');
		expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual(['whoami']);
		expect(rows).toHaveLength(0);
	});

	it('whoami call is audited with request meta', async () => {
		const { body, rows } = await rpc(['read'], 'tools/call', { name: 'whoami', arguments: {} });
		expect(body.result.structuredContent.bot).toBe('stub-bot');
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			tool: 'whoami',
			result: 'ok',
			ip: '1.2.3.4',
			user_agent: 'vitest',
			request_id: '7:ray-1'
		});
	});
});
