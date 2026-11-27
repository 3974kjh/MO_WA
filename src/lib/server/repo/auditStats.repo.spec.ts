/** countAuditRuleIds: max_rows(1000)에 잘리지 않도록 페이지로 읽는지, 실제 postgrest 요청으로 확인(네트워크 없음). */
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { forUser } from './client';
import {
	AUDIT_RULE_COUNT_MAX_PAGES,
	AUDIT_RULE_COUNT_PAGE,
	countAuditRuleIds
} from './auditStats.repo';

const OWNER = '00000000-0000-4000-8000-0000000000aa';

/** pages[i] = i번째 요청에 돌려줄 행 수(각 행 rule_ids=['R-A']). fail이면 그 번째 요청을 500으로. */
function stub(pages: number[], failAt = -1) {
	const requests: { method: string; params: URLSearchParams; range: string | null }[] = [];
	const fetchStub = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
		const i = requests.length;
		const headers = new Headers(init?.headers);
		requests.push({
			method: (init?.method ?? 'GET').toUpperCase(),
			params: url.searchParams,
			range: headers.get('range')
		});
		if (i === failAt) {
			return new Response(JSON.stringify({ message: 'stub failure', code: 'XX000' }), {
				status: 500,
				headers: { 'content-type': 'application/json' }
			});
		}
		const n = pages[i] ?? 0;
		const rows = Array.from({ length: n }, (_, k) => ({
			id: i * AUDIT_RULE_COUNT_PAGE + k + 1,
			rule_ids: k === 0 ? ['R-A', 'R-B', ''] : ['R-A']
		}));
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

describe('countAuditRuleIds', () => {
	it('한 페이지 미만이면 요청 1번: owner 필터, 빈 배열 제외, id 순, 0–999 범위', async () => {
		const { repo, requests } = stub([3]);
		const out = await countAuditRuleIds(repo);
		expect(out).toEqual({ data: { 'R-A': 3, 'R-B': 1 }, error: null, truncated: false });
		expect(requests).toHaveLength(1);
		const r = requests[0]!;
		expect(r.method).toBe('GET');
		expect(new Set(r.params.getAll('owner_id'))).toEqual(new Set([`eq.${OWNER}`]));
		expect(r.params.get('rule_ids')).toBe('neq.{}');
		expect(r.params.get('order')).toBe('id.asc');
		expect(r.params.get('select')).toBe('id,rule_ids');
		expect(r.params.get('offset') ?? r.range).toMatch(/^(0|0-999)$/);
	});

	it('1000행이 꽉 찬 페이지 뒤에는 다음 페이지를 읽어 합친다(1000행에서 조용히 잘리지 않음)', async () => {
		const { repo, requests } = stub([AUDIT_RULE_COUNT_PAGE, AUDIT_RULE_COUNT_PAGE, 5]);
		const out = await countAuditRuleIds(repo);
		expect(requests).toHaveLength(3);
		expect(out.truncated).toBe(false);
		expect(out.data['R-A']).toBe(2 * AUDIT_RULE_COUNT_PAGE + 5);
		expect(out.data['R-B']).toBe(3);
		const ranges = requests.map((r) => [r.params.get('offset'), r.params.get('limit')]);
		expect(ranges).toEqual([
			['0', '1000'],
			['1000', '1000'],
			['2000', '1000']
		]);
	});

	it('최대 페이지까지 꽉 차면 거기서 멈추고 truncated=true', async () => {
		const pages = Array.from(
			{ length: AUDIT_RULE_COUNT_MAX_PAGES + 3 },
			() => AUDIT_RULE_COUNT_PAGE
		);
		const { repo, requests } = stub(pages);
		const out = await countAuditRuleIds(repo);
		expect(requests).toHaveLength(AUDIT_RULE_COUNT_MAX_PAGES);
		expect(out.truncated).toBe(true);
		expect(out.data['R-A']).toBe(AUDIT_RULE_COUNT_MAX_PAGES * AUDIT_RULE_COUNT_PAGE);
	});

	it('중간 페이지가 실패하면 부분 건수 대신 오류만 돌려준다', async () => {
		const { repo } = stub([AUDIT_RULE_COUNT_PAGE, AUDIT_RULE_COUNT_PAGE], 1);
		const out = await countAuditRuleIds(repo);
		expect(out.data).toEqual({});
		expect(out.error).not.toBeNull();
		expect(out.truncated).toBe(false);
	});
});
