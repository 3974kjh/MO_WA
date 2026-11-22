/**
 * FE-06 L-1: listJournalKinds 상한. 실제 postgrest-js가 만든 요청 URL로 limit·owner 필터를 확인하고,
 * 상한을 넘으면 truncated로 알린다(네트워크·운영 DB 없음).
 */
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { forUser } from './client';
import { JOURNAL_KINDS_CAP, listJournalKinds } from './journalWeb.repo';

const OWNER = '00000000-0000-4000-8000-0000000000aa';

type Req = { method: string; table: string; params: URLSearchParams };

function stubClient(rows: Record<string, unknown[]> = {}, failTables: string[] = []) {
	const requests: Req[] = [];
	const fetchStub = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
		const method = (init?.method ?? 'GET').toUpperCase();
		const table = url.pathname.replace(/^\/rest\/v1\//, '');
		requests.push({ method, table, params: url.searchParams });
		if (failTables.includes(table) || failTables.includes(`${method}:${table}`)) {
			return new Response(JSON.stringify({ message: 'stub failure', code: 'XX000' }), {
				status: 500,
				headers: { 'content-type': 'application/json' }
			});
		}
		const body = rows[table] ?? [];
		return new Response(method === 'HEAD' ? null : JSON.stringify(body), {
			status: 200,
			headers: {
				'content-type': 'application/json',
				'content-range': `0-${Math.max(body.length - 1, 0)}/${body.length}`
			}
		});
	};
	const sb = createClient('http://stub.local', 'stub-anon-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { fetch: fetchStub as typeof fetch }
	});
	return { repo: forUser(sb as never, OWNER), requests };
}

const kindRows = (n: number) =>
	Array.from({ length: n }, (_, i) => ({ kind: i % 2 ? 'buy' : 'sell' }));

describe('FE-06 L-1 listJournalKinds 상한', () => {
	it('상한+1건을 요청하고 owner·보관 제외 필터를 유지한다', async () => {
		const { repo, requests } = stubClient({ journal_entries: kindRows(3) });
		await listJournalKinds(repo, { ticker: '000111', q: '' });
		const [req] = requests.filter((r) => r.table === 'journal_entries');
		expect(req.params.get('limit')).toBe(String(JOURNAL_KINDS_CAP + 1));
		expect(new Set(req.params.getAll('owner_id'))).toEqual(new Set([`eq.${OWNER}`]));
		expect(req.params.get('archived_at')).toBe('is.null');
		expect(requests.filter((r) => r.table === 'journal_entries')).toHaveLength(1);
	});

	it('상한 이하(정확히 상한)면 truncated=false, kind 그대로', async () => {
		const { repo } = stubClient({ journal_entries: kindRows(JOURNAL_KINDS_CAP) });
		const out = await listJournalKinds(repo, {});
		expect(out.error).toBeNull();
		expect(out.truncated).toBe(false);
		expect(out.data).toHaveLength(JOURNAL_KINDS_CAP);
		expect(out.data.slice(0, 2)).toEqual(['sell', 'buy']);
	});

	it('상한을 넘으면(상한+1건) truncated=true, 일부 건수를 돌려주지 않는다', async () => {
		const { repo } = stubClient({ journal_entries: kindRows(JOURNAL_KINDS_CAP + 1) });
		const out = await listJournalKinds(repo, {});
		expect(out.error).toBeNull();
		expect(out.truncated).toBe(true);
		expect(out.data).toEqual([]);
	});

	it('조회 오류는 error이고 truncated=false', async () => {
		const { repo } = stubClient({}, ['journal_entries']);
		const out = await listJournalKinds(repo, {});
		expect(out.error).not.toBeNull();
		expect(out.truncated).toBe(false);
	});
});
