/**
 * FE-10 Low-3: 목록 repo가 count 쿼리와 page 쿼리 둘 다에 owner와 같은 필터를 붙이는지,
 * 실제 supabase-js(postgrest-js) 클라이언트가 만든 HTTP 요청 URL로 확인한다.
 * 네트워크·운영 DB는 쓰지 않는다(fetch를 가로채 요청만 기록하고 고정 응답을 돌려준다).
 */
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { forUser } from './client';
import {
	listBriefingsWithKospi,
	listInstrumentLabels,
	listInstrumentMeta,
	listJournalPage,
	listProposalHistory
} from './webLoads.repo';
import { listIndicatorSeries } from './market.repo';

const OWNER = '00000000-0000-4000-8000-0000000000aa';

type Req = { method: string; table: string; params: URLSearchParams };

function stubClient(rows: Record<string, unknown[]> = {}) {
	const requests: Req[] = [];
	const fetchStub = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
		const method = (init?.method ?? 'GET').toUpperCase();
		const table = url.pathname.replace(/^\/rest\/v1\//, '');
		requests.push({ method, table, params: url.searchParams });
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

/** owner·필터 관련 파라미터만 추린다(select·order·limit 등 페이지 전용 키는 뺀다). */
function filterParams(p: URLSearchParams): [string, string][] {
	const skip = new Set(['select', 'order', 'limit', 'offset']);
	return [...p.entries()].filter(([k]) => !skip.has(k)).sort(([a], [b]) => a.localeCompare(b));
}

/** owner_id 조건은 이 owner의 eq만 있어야 한다(fromRepo 강제 + withOwnerFilter로 두 번 붙어도 같은 값). */
function expectOwnerOnly(p: URLSearchParams) {
	const v = p.getAll('owner_id');
	expect(v.length).toBeGreaterThan(0);
	expect(new Set(v)).toEqual(new Set([`eq.${OWNER}`]));
}

const page = { page: 1, pageSize: 20, offset: 0, limit: 20 };

describe('FE-10 listBriefingsWithKospi: count·page 요청 모두 같은 owner·필터', () => {
	it('q·tag·month가 두 요청에 같은 모양으로 붙는다', async () => {
		const { repo, requests } = stubClient();
		const { error } = await listBriefingsWithKospi(repo, page, {
			q: 'FOMC',
			tag: '52주 저가',
			month: '2026-11'
		});
		expect(error).toBeNull();
		const reports = requests.filter((r) => r.table === 'reports');
		expect(reports.map((r) => r.method)).toEqual(['HEAD', 'GET']);
		const [count, list] = reports;
		expect(filterParams(count.params)).toEqual(filterParams(list.params));
		expectOwnerOnly(count.params);
		expectOwnerOnly(list.params);
		expect(list.params.get('or')).toBe(
			'(search_tsv.wfts(simple)."FOMC",title.ilike."%FOMC%",headline.ilike."%FOMC%")'
		);
		// Low-2: 원소를 큰따옴표로 감싼 배열 리터럴(공백이 있어도 원소 하나).
		expect(list.params.get('tags')).toBe('cs.{"52주 저가"}');
		expect(list.params.getAll('report_date')).toEqual(['gte.2026-11-01', 'lt.2026-12-01']);
		expect(list.params.get('archived_at')).toBe('is.null');
	});

	it('허용 밖 tag는 두 요청 어디에도 실리지 않는다', async () => {
		for (const tag of ['a,b', 'a}', 'x"y', '{a}', 'a\\b']) {
			const { repo, requests } = stubClient();
			await listBriefingsWithKospi(repo, page, { q: '', tag, month: '' });
			const reports = requests.filter((r) => r.table === 'reports');
			expect(reports).toHaveLength(2);
			for (const r of reports) {
				expect(r.params.has('tags')).toBe(false);
				expectOwnerOnly(r.params);
			}
		}
	});

	it('or() 주입 시도가 owner 조건을 바꾸지 못한다', async () => {
		const { repo, requests } = stubClient();
		await listBriefingsWithKospi(repo, page, {
			q: 'x),owner_id.neq.(y',
			tag: '',
			month: ''
		});
		for (const r of requests.filter((x) => x.table === 'reports')) {
			expectOwnerOnly(r.params);
			expect(r.params.getAll('or')).toHaveLength(1);
			expect(r.params.get('or')).toBe(
				'(search_tsv.wfts(simple)."x owner id.neq. y",title.ilike."%x owner id.neq. y%",headline.ilike."%x owner id.neq. y%")'
			);
		}
	});

	it('kospi 보조 조회에도 owner가 붙는다', async () => {
		const { repo, requests } = stubClient({
			reports: [
				{
					id: 'r1',
					kind: 'daily_brief',
					headline: 'h',
					title: 't',
					report_date: '2026-11-20',
					tags: []
				}
			]
		});
		const { data } = await listBriefingsWithKospi(repo, page, undefined);
		expect(data.items).toHaveLength(1);
		const mi = requests.find((r) => r.table === 'market_indicators');
		if (!mi) throw new Error('market_indicators 요청이 없다');
		expectOwnerOnly(mi.params);
	});
});

describe('FE-10 listJournalPage: count·page 요청 모두 같은 owner·필터', () => {
	it('type·ticker·q가 두 요청에 같은 모양으로 붙는다', async () => {
		const { repo, requests } = stubClient();
		const { error } = await listJournalPage(
			repo,
			{ page: 1, pageSize: 30, offset: 0, limit: 30 },
			{ type: 'buy', ticker: 'NVDA', q: '추가' }
		);
		expect(error).toBeNull();
		const journal = requests.filter((r) => r.table === 'journal_entries');
		expect(journal.map((r) => r.method)).toEqual(['HEAD', 'GET']);
		const [count, list] = journal;
		expect(filterParams(count.params)).toEqual(filterParams(list.params));
		for (const r of journal) {
			expectOwnerOnly(r.params);
			expect(r.params.get('kind')).toBe('eq.buy');
			expect(r.params.get('tickers')).toBe('cs.{NVDA}');
			expect(r.params.get('or')).toBe(
				'(search_tsv.wfts(simple)."추가",title.ilike."%추가%",memo_md.ilike."%추가%")'
			);
			expect(r.params.get('archived_at')).toBe('is.null');
		}
	});
});

describe('FE-03 홈 보조 load', () => {
	it('listIndicatorSeries: owner·key 조건, 최신 N개를 오름차순으로, 숫자 아닌 값은 뺀다', async () => {
		const { repo, requests } = stubClient({
			market_indicators: [
				{ as_of: '2026-11-20', value: '11.5' },
				{ as_of: '2026-11-19', value: null },
				{ as_of: '2026-11-18', value: 10 }
			]
		});
		const { data, error } = await listIndicatorSeries(repo, 'kospi', 500);
		expect(error).toBeNull();
		expect(data).toEqual([
			{ as_of: '2026-11-18', value: 10 },
			{ as_of: '2026-11-20', value: 11.5 }
		]);
		const [r] = requests;
		expectOwnerOnly(r.params);
		expect(r.params.get('key')).toBe('eq.kospi');
		expect(r.params.get('order')).toBe('as_of.desc');
		expect(r.params.get('limit')).toBe('60');
	});

	it('listInstrumentLabels: id 중복 제거, owner 조건, 빈 목록이면 요청 없음', async () => {
		const empty = stubClient();
		expect(await listInstrumentLabels(empty.repo, [])).toEqual({ data: [], error: null });
		expect(empty.requests).toHaveLength(0);

		const { repo, requests } = stubClient({
			instruments: [{ id: 'a', name: '가', ticker: 'A' }]
		});
		const { data } = await listInstrumentLabels(repo, ['a', 'a', 'b']);
		expect(data).toEqual([{ id: 'a', name: '가', ticker: 'A' }]);
		expect(requests).toHaveLength(1);
		expectOwnerOnly(requests[0].params);
		expect(requests[0].params.get('id')).toBe('in.(a,b)');
		expect(requests[0].params.get('select')).toBe('id,name,ticker');
	});
});

describe('FE-07 변경 요청 보조 load', () => {
	it('listProposalHistory: 종결 상태만, count·page 같은 owner·필터, 결정 시각 최신순', async () => {
		const { repo, requests } = stubClient({
			position_proposals: [
				{
					id: 'h1',
					display_id: 'P-0003',
					change_type: 'set_qty_avg',
					status: 'approved',
					proposed_by_type: 'user',
					proposed_by: null,
					proposed_values: { qty: 2 },
					applied_values: { qty: 2 },
					current_values: null,
					reason_md: '이유',
					decision_note: '메모',
					evidence: [],
					base_version: 1,
					position_id: null,
					instrument_id: 'i1',
					created_at: '2026-11-21T00:00:00Z',
					expires_at: '2026-11-28T00:00:00Z',
					held_at: null,
					decided_at: '2026-11-21T01:00:00Z'
				}
			]
		});
		const { data, error } = await listProposalHistory(repo, page);
		expect(error).toBeNull();
		expect(data.items).toHaveLength(1);
		expect(data.items[0]).toMatchObject({
			reason_md: '이유',
			decision_note: '메모',
			proposer_name: '나'
		});
		const pp = requests.filter((r) => r.table === 'position_proposals');
		expect(pp.map((r) => r.method)).toEqual(['HEAD', 'GET']);
		const [count, list] = pp;
		expect(filterParams(count.params)).toEqual(filterParams(list.params));
		for (const r of pp) {
			expectOwnerOnly(r.params);
			expect(r.params.get('status')).toBe(
				'in.(approved,rejected,superseded,cancelled,expired,conflict)'
			);
		}
		expect(list.params.get('order')).toBe('decided_at.desc.nullslast,created_at.desc');
		expect(requests.every((r) => r.method === 'GET' || r.method === 'HEAD')).toBe(true);
	});

	it('listInstrumentMeta: asset_type 포함, owner 조건, 빈 목록이면 요청 없음', async () => {
		const empty = stubClient();
		expect(await listInstrumentMeta(empty.repo, [])).toEqual({ data: [], error: null });
		expect(empty.requests).toHaveLength(0);
		const { repo, requests } = stubClient({
			instruments: [{ id: 'a', name: '가', ticker: 'A', asset_type: 'etf' }]
		});
		const { data } = await listInstrumentMeta(repo, ['a', 'a']);
		expect(data).toEqual([{ id: 'a', name: '가', ticker: 'A', asset_type: 'etf' }]);
		expectOwnerOnly(requests[0].params);
		expect(requests[0].params.get('select')).toBe('id,name,ticker,asset_type');
	});
});
