/** FE-09 활동 기록 목록: 실제 postgrest 요청 URL로 owner·필터·열·limit을 확인(네트워크 없음). */
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { forUser } from './client';
import { AUDIT_LIST_COLUMNS, listAuditLog } from './auditLog.repo';

const OWNER = '00000000-0000-4000-8000-0000000000aa';

function stub(rows: unknown[] = [], fail = false) {
	const requests: { method: string; table: string; params: URLSearchParams }[] = [];
	const fetchStub = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
		requests.push({
			method: (init?.method ?? 'GET').toUpperCase(),
			table: url.pathname.replace(/^\/rest\/v1\//, ''),
			params: url.searchParams
		});
		if (fail) {
			return new Response(JSON.stringify({ message: 'stub failure', code: 'XX000' }), {
				status: 500,
				headers: { 'content-type': 'application/json' }
			});
		}
		return new Response(JSON.stringify(rows), {
			status: 200,
			headers: { 'content-type': 'application/json' }
		});
	};
	const sb = createClient('http://stub.local', 'stub-anon-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { fetch: fetchStub as typeof fetch }
	});
	return { repo: forUser(sb as never, OWNER), requests };
}

const row = (id: number) => ({
	id,
	created_at: '2026-11-20T00:00:00Z',
	actor_type: 'bot',
	bot_client_id: null,
	tool: 't',
	result: 'ok',
	error_code: null,
	rule_ids: [],
	args_preview: {},
	duration_ms: 3
});

describe('listAuditLog', () => {
	it('읽기 전용 GET, owner 필터, 명시 열(select * 아님), limit+1', async () => {
		const { repo, requests } = stub([]);
		await listAuditLog(repo, {}, 100);
		expect(requests).toHaveLength(1);
		const r = requests[0]!;
		expect(r.method).toBe('GET');
		expect(r.table).toBe('mcp_audit_log');
		expect(new Set(r.params.getAll('owner_id'))).toEqual(new Set([`eq.${OWNER}`]));
		expect(r.params.get('select')).toBe(AUDIT_LIST_COLUMNS.replace(/\s/g, ''));
		expect(r.params.get('select')).not.toBe('*');
		expect(r.params.get('select')).not.toMatch(/\bip\b|user_agent|warnings/);
		expect(r.params.get('limit')).toBe('101');
	});

	it('봇·툴·결과·WARN·규칙 필터가 요청에 붙는다', async () => {
		const { repo, requests } = stub([]);
		const bot = '11111111-1111-4111-8111-111111111111';
		await listAuditLog(repo, { bot, tool: 'x.y', result: 'denied', warn: true, rule: 'R-VAL-T05' });
		const p = requests[0]!.params;
		expect(p.get('bot_client_id')).toBe(`eq.${bot}`);
		expect(p.get('tool')).toBe('eq.x.y');
		expect(p.get('result')).toBe('eq.denied');
		expect(p.get('rule_ids')).toContain('neq.{}');
		expect(p.getAll('rule_ids').some((v) => v.startsWith('cs.'))).toBe(true);
	});

	it('limit을 넘으면 잘림 표시 + 정확히 limit건', async () => {
		const { repo } = stub([row(3), row(2), row(1)]);
		const out = await listAuditLog(repo, {}, 2);
		expect(out.truncated).toBe(true);
		expect(out.data.map((r) => r.id)).toEqual([3, 2]);
		const { repo: r2 } = stub([row(1)]);
		expect((await listAuditLog(r2, {}, 2)).truncated).toBe(false);
	});

	it('오류는 error로', async () => {
		const { repo } = stub([], true);
		const out = await listAuditLog(repo);
		expect(out.error).toBeTruthy();
		expect(out.data).toEqual([]);
	});
});
