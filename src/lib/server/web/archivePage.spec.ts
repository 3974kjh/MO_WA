/**
 * FE-08: 실제 supabase-js 클라이언트가 만든 HTTP 요청으로 owner 필터·명시 열·limit을 확인한다.
 * 네트워크·운영 DB는 쓰지 않는다(fetch를 가로채 요청만 기록하고 고정 응답을 돌려준다).
 */
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
	ARCHIVE_LIST_LIMIT,
	BOT_ARCHIVE_AUDIT_LIMIT,
	forUser,
	listArchivedRows
} from '$lib/server/repo';
import { handleArchiveRestore, loadArchive } from './archivePage';

const OWNER = '00000000-0000-4000-8000-0000000000aa';

type Req = { method: string; table: string; params: URLSearchParams; body: string | null };

function stub(rows: Record<string, unknown[]> = {}, failTables: string[] = []) {
	const requests: Req[] = [];
	const fetchStub = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
		const method = (init?.method ?? 'GET').toUpperCase();
		const table = url.pathname.replace(/^\/rest\/v1\//, '');
		requests.push({
			method,
			table,
			params: url.searchParams,
			body: typeof init?.body === 'string' ? init.body : null
		});
		if (failTables.includes(table)) {
			return new Response(JSON.stringify({ message: 'stub failure', code: 'XX000' }), {
				status: 500,
				headers: { 'content-type': 'application/json' }
			});
		}
		return new Response(JSON.stringify(rows[table] ?? []), {
			status: 200,
			headers: { 'content-type': 'application/json' }
		});
	};
	const sb = createClient('http://stub.local', 'stub-anon-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { fetch: fetchStub as typeof fetch }
	});
	return { sb, requests };
}

describe('FE-08 listArchivedRows', () => {
	it('6개 유형만, owner·보관 행 필터·명시 열·limit+1', async () => {
		const { sb, requests } = stub();
		await listArchivedRows(forUser(sb as never, OWNER));
		expect(requests.map((r) => r.table).sort()).toEqual(
			['decisions', 'events', 'instruments', 'journal_entries', 'positions', 'reports'].sort()
		);
		for (const r of requests) {
			expect(r.method).toBe('GET');
			expect(r.params.get('owner_id')).toBe(`eq.${OWNER}`);
			expect(r.params.get('archived_at')).toBe('not.is.null');
			expect(r.params.get('limit')).toBe(String(ARCHIVE_LIST_LIMIT + 1));
			expect(r.params.get('order')).toBe('archived_at.desc');
			const select = r.params.get('select') ?? '';
			expect(select).not.toContain('*');
			expect(select).toContain('archived_at');
			expect(select).not.toContain('body_md');
		}
	});

	it('limit을 넘으면 잘라내고 truncated로 알린다. 한 유형 실패는 그 유형만', async () => {
		const many = Array.from({ length: 4 }, (_, i) => ({
			id: `d${i}`,
			title: 't',
			archived_at: '2026-11-20T00:00:00Z'
		}));
		const { sb } = stub({ decisions: many }, ['events']);
		const out = await listArchivedRows(forUser(sb as never, OWNER), 3);
		expect(out.data.decisions).toHaveLength(3);
		expect(out.truncated).toEqual(['decisions']);
		expect(Object.keys(out.errors)).toEqual(['events']);
		expect(out.data.events).toEqual([]);
	});
});

describe('FE-08 loadArchive', () => {
	it('봇 보관 기록으로 보관한 사람을 채우고, 활동 기록도 owner·도구·성공으로 거른다', async () => {
		const { sb, requests } = stub({
			journal_entries: [
				{ id: 'j1', title: '봇', entry_date: '2026-11-01', archived_at: '2026-11-20T00:00:00Z' },
				{ id: 'j2', title: '나', entry_date: '2026-11-02', archived_at: '2026-11-20T01:00:00Z' }
			],
			positions: [
				{ id: 'p1', status: 'closed', archived_at: '2026-11-19T00:00:00Z', instruments: null }
			],
			mcp_audit_log: [
				{
					bot_client_id: 'b1',
					tool: 'archive_journal_entry',
					affected_ids: [{ table: 'journal_entries', id: 'j1' }],
					created_at: '2026-11-20T00:00:01Z'
				}
			],
			bot_clients: [{ id: 'b1', name: '투자 관리 봇' }]
		});
		const data = await loadArchive({ supabase: sb as never, user: { id: OWNER } as never });
		const by = Object.fromEntries(data.items.map((i) => [i.id, i.archivedBy]));
		expect(by).toEqual({ j1: '투자 관리 봇', j2: '나', p1: '나' });
		expect(data.error).toBeNull();
		expect(data.byError).toBe(false);

		const audit = requests.find((r) => r.table === 'mcp_audit_log')!;
		expect(audit.params.get('owner_id')).toBe(`eq.${OWNER}`);
		expect(audit.params.get('actor_type')).toBe('eq.bot');
		expect(audit.params.get('result')).toBe('eq.ok');
		expect(audit.params.get('select')).toBe('bot_client_id,tool,affected_ids,created_at');
		expect(audit.params.get('created_at')).toBe('gte.2026-11-19T23:58:00.000Z');
		expect(audit.params.get('limit')).toBe(String(BOT_ARCHIVE_AUDIT_LIMIT + 1));
		const bots = requests.find((r) => r.table === 'bot_clients')!;
		expect(bots.params.get('owner_id')).toBe(`eq.${OWNER}`);
	});

	it('읽기 실패는 일반 문구만(원문 없음), 활동 기록 실패면 보관한 사람은 —', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { sb } = stub(
			{
				decisions: [{ id: 'd1', title: 't', archived_at: '2026-11-20T00:00:00Z' }]
			},
			['reports', 'mcp_audit_log']
		);
		const data = await loadArchive({ supabase: sb as never, user: { id: OWNER } as never });
		expect(data.error).toBe('목록을 불러오지 못했어요.');
		expect(JSON.stringify(data)).not.toContain('stub failure');
		expect(data.byError).toBe(true);
		expect(data.items.map((i) => i.archivedBy)).toEqual(['—']);
		log.mockRestore();
	});
});

describe('FE-08 보관한 사람: 활동 기록 상한(500)·읽기 실패는 실패 닫힘', () => {
	const NEW = '2026-11-21T00:00:00.000Z';
	/** 최신순 501건(상한+1): 모두 다른 행에 대한 봇 보관 기록, NEW부터 1초씩 과거로 */
	const flood = Array.from({ length: BOT_ARCHIVE_AUDIT_LIMIT + 1 }, (_, i) => ({
		bot_client_id: 'b1',
		tool: 'archive_report',
		affected_ids: [{ table: 'reports', id: `other-${i}` }],
		created_at: new Date(Date.parse(NEW) - i * 1000).toISOString()
	}));

	it('상한에 걸리면 잘린 구간보다 오래된 미매칭 행은 —, 읽은 구간 안의 미매칭 행만 나', async () => {
		const { sb } = stub({
			reports: [
				// 읽은 범위(최신 500건 ≈ NEW−499초 이후) 밖: 오래된 보관
				{ id: 'r-old', title: 'a', report_date: '2026-10-01', archived_at: '2026-11-01T00:00:00Z' },
				// 읽은 범위 안(NEW+1시간): 구간을 다 봤고 매칭 없음
				{ id: 'r-new', title: 'b', report_date: '2026-11-20', archived_at: '2026-11-21T01:00:00Z' }
			],
			positions: [
				{ id: 'p1', status: 'closed', archived_at: '2026-10-01T00:00:00Z', instruments: null }
			],
			mcp_audit_log: flood,
			bot_clients: [{ id: 'b1', name: '리포트 봇' }]
		});
		const data = await loadArchive({ supabase: sb as never, user: { id: OWNER } as never });
		const by = Object.fromEntries(data.items.map((i) => [i.id, i.archivedBy]));
		expect(by['r-old']).toBe('—');
		expect(by['r-new']).toBe('나');
		expect(by.p1).toBe('나');
	});

	it('상한에 걸려도 확정 매칭은 봇 이름', async () => {
		const hit = {
			bot_client_id: 'b1',
			tool: 'archive_report',
			affected_ids: [{ table: 'reports', id: 'r-hit' }],
			created_at: NEW
		};
		const { sb } = stub({
			reports: [{ id: 'r-hit', title: 'a', report_date: '2026-11-20', archived_at: NEW }],
			mcp_audit_log: [hit, ...flood],
			bot_clients: [{ id: 'b1', name: '리포트 봇' }]
		});
		const data = await loadArchive({ supabase: sb as never, user: { id: OWNER } as never });
		expect(data.items[0].archivedBy).toBe('리포트 봇');
	});

	it('상한 미만이면 구간을 다 본 것: 미매칭은 나', async () => {
		const { sb } = stub({
			decisions: [{ id: 'd1', title: 't', archived_at: '2026-11-01T00:00:00Z' }],
			mcp_audit_log: flood.slice(0, 10)
		});
		const data = await loadArchive({ supabase: sb as never, user: { id: OWNER } as never });
		expect(data.items[0].archivedBy).toBe('나');
	});

	it('활동 기록을 못 읽으면 봇 보관 가능 유형은 —, 보유 종목·종목은 나', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const at = '2026-11-20T00:00:00Z';
		const { sb } = stub(
			{
				reports: [{ id: 'r', title: 't', report_date: '2026-11-20', archived_at: at }],
				journal_entries: [{ id: 'j', title: 't', entry_date: '2026-11-20', archived_at: at }],
				decisions: [{ id: 'd', title: 't', archived_at: at }],
				events: [{ id: 'e', title: 't', event_date: '2026-11-20', archived_at: at }],
				positions: [{ id: 'p', status: 'holding', archived_at: at, instruments: null }],
				instruments: [{ id: 'i', ticker: 'ABCD', name: 'x', archived_at: at }]
			},
			['mcp_audit_log']
		);
		const data = await loadArchive({ supabase: sb as never, user: { id: OWNER } as never });
		const by = Object.fromEntries(data.items.map((i) => [i.id, i.archivedBy]));
		expect(by).toEqual({ r: '—', j: '—', d: '—', e: '—', p: '나', i: '나' });
		expect(data.byError).toBe(true);
		log.mockRestore();
	});
});

describe('FE-08 restore → 공유 handleRestore(실제 경로)', () => {
	it('내 행만(owner_id=eq.세션 사용자) archived_at=null로 되돌린다', async () => {
		const { sb, requests } = stub({ events: [{ id: 'e1' }] });
		const form = new FormData();
		form.set('id', 'e1');
		form.set('table', 'events');
		form.set('owner_id', 'someone-else');
		const out = await handleArchiveRestore(sb as never, OWNER, form);
		expect(out).toEqual({ ok: true });
		const patch = requests.find((r) => r.method === 'PATCH')!;
		expect(patch.table).toBe('events');
		expect(patch.params.get('id')).toBe('eq.e1');
		expect(patch.params.get('owner_id')).toBe(`eq.${OWNER}`);
		expect(JSON.parse(patch.body ?? '{}')).toEqual({ archived_at: null });
	});

	it('다른 owner 행이라 0건이면 성공으로 보지 않는다', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { sb } = stub({ reports: [] });
		const form = new FormData();
		form.set('id', 'r-other');
		form.set('table', 'reports');
		const out = (await handleArchiveRestore(sb as never, OWNER, form)) as { status?: number };
		expect(out.status).toBe(400);
		log.mockRestore();
	});

	it('허용하지 않은 table은 요청을 보내지 않는다', async () => {
		const { sb, requests } = stub();
		const form = new FormData();
		form.set('id', 'x');
		form.set('table', 're_complexes');
		const out = (await handleArchiveRestore(sb as never, OWNER, form)) as { status?: number };
		expect(out.status).toBe(400);
		expect(requests).toHaveLength(0);
	});
});
