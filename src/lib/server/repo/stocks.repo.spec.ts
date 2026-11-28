/**
 * FE-11 종목 화면 repo: 실제 supabase-js가 만든 요청 URL로 owner 필터·읽기 조건을 확인한다(네트워크 없음).
 */
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { forUser } from './client';
import {
	getEquityReportBySlug,
	getStockInstrument,
	listEquityReports,
	listJournalMentions,
	listLatestQuotes,
	listQuoteSeries,
	listStockInstruments,
	listStockPositions,
	QUOTE_SERIES_MAX
} from './stocks.repo';

const OWNER = '00000000-0000-4000-8000-0000000000aa';

type Req = { method: string; table: string; params: URLSearchParams; prefer: string | null };

function stubClient(rows: Record<string, unknown[]> = {}, failTables: string[] = []) {
	const requests: Req[] = [];
	const fetchStub = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
		const method = (init?.method ?? 'GET').toUpperCase();
		const table = url.pathname.replace(/^\/rest\/v1\//, '');
		requests.push({
			method,
			table,
			params: url.searchParams,
			prefer: new Headers(init?.headers).get('prefer')
		});
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

/** owner_id 조건은 이 owner의 eq만 있어야 한다(fromRepo 강제 + withOwnerFilter로 두 번 붙어도 같은 값). */
function expectOwnerOnly(p: URLSearchParams) {
	const v = p.getAll('owner_id');
	expect(v.length).toBeGreaterThan(0);
	expect(new Set(v)).toEqual(new Set([`eq.${OWNER}`]));
}

describe('FE-11 stocks.repo', () => {
	it('보드 종목: 보관 제외 · stock·etf만(결정 3) · owner만', async () => {
		const { repo, requests } = stubClient();
		await listStockInstruments(repo);
		const p = requests[0].params;
		expectOwnerOnly(p);
		expect(p.get('archived_at')).toBe('is.null');
		expect(p.get('asset_type')).toBe('in.(stock,etf)');
		expect(requests.every((r) => r.method === 'GET')).toBe(true);
	});
	it('종목 하나는 코드로(보관 여부도 받아 load가 404 판단)', async () => {
		const { repo, requests } = stubClient({ instruments: [] });
		const { data } = await getStockInstrument(repo, 'UST_30Y');
		expect(data).toBeNull();
		expectOwnerOnly(requests[0].params);
		expect(requests[0].params.get('ticker')).toBe('eq.UST_30Y');
		expect(requests[0].params.get('select')).toContain('archived_at');
	});
	it('최신 시세는 종목마다 첫 행 1건, 빈 목록이면 요청 없음', async () => {
		const none = stubClient();
		expect((await listLatestQuotes(none.repo, [])).data).toEqual([]);
		expect(none.requests).toHaveLength(0);
		const { repo, requests } = stubClient({
			price_snapshots: [
				{ instrument_id: 'a', as_of: '2026-11-20', close: 2 },
				{ instrument_id: 'b', as_of: '2026-11-19', close: 5 },
				{ instrument_id: 'a', as_of: '2026-11-19', close: 1 }
			]
		});
		const { data } = await listLatestQuotes(repo, ['a', 'b']);
		expect(data.map((q) => [q.instrument_id, q.close])).toEqual([
			['a', 2],
			['b', 5]
		]);
		expectOwnerOnly(requests[0].params);
		expect(requests[0].params.get('order')).toBe('as_of.desc');
	});
	it('시세 흐름은 최근 N건을 오래된 순으로', async () => {
		const { repo, requests } = stubClient({
			price_snapshots: [{ as_of: '2026-11-20' }, { as_of: '2026-11-19' }]
		});
		const { data } = await listQuoteSeries(repo, 'a');
		expect(data.map((d) => d.as_of)).toEqual(['2026-11-19', '2026-11-20']);
		expect(requests[0].params.get('limit')).toBe(String(QUOTE_SERIES_MAX));
		expectOwnerOnly(requests[0].params);
	});
	it('포지션은 보유·계획만, 보관 제외', async () => {
		const { repo, requests } = stubClient();
		await listStockPositions(repo, 'a');
		const p = requests[0].params;
		expectOwnerOnly(p);
		expect(p.get('instrument_id')).toBe('eq.a');
		expect(p.get('archived_at')).toBe('is.null');
		expect(p.get('status')).toBe('in.(holding,planned)');
	});
	it('분석 리포트: equity_analysis · 보관 제외 · 종목 포함, 메타는 종목 하나일 때만', async () => {
		const one = stubClient();
		await listEquityReports(one.repo, 'GOOGL');
		const p = one.requests[0].params;
		expectOwnerOnly(p);
		expect(p.get('kind')).toBe('eq.equity_analysis');
		expect(p.get('archived_at')).toBe('is.null');
		expect(p.get('tickers')).toBe('cs.{GOOGL}');
		expect(p.get('select')).toContain('meta');
		const all = stubClient();
		await listEquityReports(all.repo);
		expect(all.requests[0].params.get('tickers')).toBeNull();
		expect(all.requests[0].params.get('select')).not.toContain('meta');
	});
	it('slug가 겹치면 report_date 최신 1건(Q-T1 결정 전 임시)', async () => {
		const { repo, requests } = stubClient({
			reports: [{ slug: 'googl', report_date: '2026-11-21' }]
		});
		const { data } = await getEquityReportBySlug(repo, 'googl');
		expect(data?.report_date).toBe('2026-11-21');
		const p = requests[0].params;
		expectOwnerOnly(p);
		expect(p.get('slug')).toBe('eq.googl');
		expect(p.get('order')).toBe('report_date.desc');
		expect(p.get('limit')).toBe('1');
		expect(p.get('select')).not.toContain('body');
	});
	it('매매일지 언급은 건수와 최근 3건', async () => {
		const { repo, requests } = stubClient({ journal_entries: [{ id: 'j1' }] });
		const { data } = await listJournalMentions(repo, '035420');
		expect(data.total).toBe(1);
		expect(requests[0].params.get('tickers')).toBe('cs.{035420}');
		expectOwnerOnly(requests[0].params);
	});
	it('읽기 실패는 오류로 돌려준다(빈 값 + error)', async () => {
		const { repo } = stubClient({}, ['instruments']);
		const r = await listStockInstruments(repo);
		expect(r.error).not.toBeNull();
		expect(r.data).toEqual([]);
	});
});
