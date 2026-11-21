/**
 * FE-07 포트폴리오 load·화면 소스 계약.
 * - 로그인 load는 실제 repo 로더(BE-11/19)를 부르고 픽스처를 쓰지 않는다.
 * - 화면 소스에 시안 샘플 수치·픽스처·'충돌'·다크 변형 유틸리티·왼쪽 색 세로선이 없다.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
	forUser: vi.fn(() => ({})),
	listQueueProposals: vi.fn(),
	listPositionCards: vi.fn(),
	listAttentionNeeded: vi.fn(),
	listProposalHistory: vi.fn(),
	listInstrumentMeta: vi.fn()
}));
vi.mock('$lib/server/repo', () => repo);

import { load } from './+page.server';

const card = (over: Record<string, unknown>) => ({
	id: 'q1',
	display_id: 'P-0031',
	change_type: 'set_qty_avg',
	status: 'pending',
	calc_note: null,
	reason_md: null,
	decision_note: null,
	proposed_by_type: 'bot',
	proposer_name: '투자 관리 봇',
	evidence_chips: [],
	attention_started_at: null,
	acknowledged_at: null,
	base_version: 1,
	approval_version: 2,
	would_conflict: true,
	proposed_values: { qty: 5, avg_price: 77 },
	applied_values: null,
	current_values: { qty: 4, avg_price: 70, currency: 'KRW' },
	position_id: 'p1',
	instrument_id: null,
	created_at: '2026-11-21T00:00:00Z',
	expires_at: '2026-11-28T00:00:00Z',
	held_at: null,
	decided_at: null,
	...over
});

const position = {
	id: 'p1',
	instrument_id: 'i1',
	status: 'holding',
	currency: 'KRW',
	qty: 6,
	avg_price: 72,
	approval_version: 2,
	trigger_price: 50,
	trigger_direction: 'below',
	watch_only: false,
	latest_price: null,
	latest_price_as_of: null,
	latest_price_currency: null
};

const call = () =>
	(load as unknown as (e: unknown) => Promise<Record<string, unknown>>)({
		locals: { user: { id: 'u1' }, supabase: {} },
		url: new URL('http://localhost/portfolio'),
		parent: async () => ({})
	});

afterEach(() => vi.clearAllMocks());

describe('FE-07 portfolio load', () => {
	it('실제 로더 4개 + 종목 정보를 부르고 화면용 항목으로 바꾼다', async () => {
		repo.listQueueProposals.mockResolvedValue({
			data: { items: [card({})], total: 1 },
			error: null
		});
		repo.listPositionCards.mockResolvedValue({ data: [position], error: null });
		repo.listAttentionNeeded.mockResolvedValue({
			data: {
				positions: [
					card({ id: 'a1', status: 'conflict', attention_started_at: '2026-11-21T00:00:00Z' })
				],
				principles: []
			},
			error: null
		});
		repo.listProposalHistory.mockResolvedValue({
			data: {
				items: [card({ id: 'h1', status: 'approved', applied_values: { qty: 4, avg_price: 77 } })],
				total: 1
			},
			error: null
		});
		repo.listInstrumentMeta.mockResolvedValue({
			data: [{ id: 'i1', name: '실데이터종목', ticker: 'RD', asset_type: 'stock' }],
			error: null
		});

		const out = (await call()) as {
			queue: { items: Array<Record<string, unknown>>; total: number };
			history: { items: Array<Record<string, unknown>> };
			attentionNeeded: Array<Record<string, unknown>>;
			holdings: Array<Record<string, unknown>>;
		};
		expect(repo.listQueueProposals).toHaveBeenCalledTimes(1);
		expect(repo.listAttentionNeeded).toHaveBeenCalledTimes(1);
		expect(repo.listProposalHistory).toHaveBeenCalledWith(expect.anything(), {
			page: 1,
			pageSize: 20,
			offset: 0,
			limit: 20
		});
		expect(new Set(repo.listInstrumentMeta.mock.calls[0][1] as string[])).toEqual(new Set(['i1']));
		expect(out.queue.items[0]).toMatchObject({
			name: '실데이터종목',
			base_version: 1,
			approval_version: 2,
			live_values: { qty: 6, avg_price: 72 }
		});
		expect(out.attentionNeeded.map((i) => i.id)).toEqual(['a1']);
		expect(out.history.items[0]).toMatchObject({ id: 'h1', status: 'approved' });
		expect(out.holdings).toEqual([
			{
				id: 'p1',
				name: '실데이터종목',
				status: 'holding',
				currency: 'KRW',
				qty: 6,
				avg_price: 72,
				approval_version: 2,
				asset_type: 'stock'
			}
		]);
		// 감시 가격 등 직접 기록 값은 화면 데이터에 싣지 않는다
		expect(JSON.stringify(out)).not.toMatch(/trigger_price|watch_only|breakeven/);
	});

	it('비로그인은 401(레이아웃이 먼저 /login으로 보낸다)', async () => {
		await expect(
			(load as unknown as (e: unknown) => Promise<unknown>)({
				locals: { user: null, supabase: {} },
				url: new URL('http://localhost/portfolio')
			})
		).rejects.toMatchObject({ status: 401 });
	});
});

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const SOURCES = [
	'src/routes/(app)/portfolio/+page.svelte',
	'src/routes/(app)/portfolio/+page.server.ts',
	...readdirSync(join(root, 'src/lib/components/queue')).map(
		(f) => `src/lib/components/queue/${f}`
	),
	'src/lib/queue/proposals.ts',
	'src/lib/queue/view.ts',
	'src/lib/queue/deferred.ts'
];

describe('FE-07 화면 소스 계약', () => {
	it.each(SOURCES)('%s: 픽스처·시안 샘플·충돌·다크 변형·왼쪽 색 세로선 없음', (f) => {
		const src = read(f);
		expect(src).not.toMatch(/\$lib\/fixtures|\/fixtures\//);
		for (const sample of [
			'P-0412',
			'P-0411',
			'P-0410',
			'P-0409',
			'P-0408',
			'295.04',
			'290.98',
			'292.10',
			'100.42',
			'210,000',
			'202,438',
			'52,450',
			'138,191',
			'SGOV',
			'NAVER',
			'GOOGL',
			'알파벳',
			'(예시)',
			'시안 ·',
			'FE-07 시안'
		]) {
			expect(src, `${f} ${sample}`).not.toContain(sample);
		}
		expect(src).not.toContain('충돌');
		expect(src).not.toMatch(new RegExp('\\bdark' + ':'));
		expect(src).not.toMatch(/border-l-|border-left:\s*[34]px|inset\s+[34]px/);
	});

	it('page는 G-2 유예 전송(deferred)과 기존 폼 액션을 쓰고, 그대로 반영에는 overrides를 보내지 않는다', () => {
		const src = read('src/routes/(app)/portfolio/+page.svelte');
		expect(src).toMatch(/createDeferredSender/);
		expect(src).toMatch(/postAction\('approve'/);
		expect(src).toMatch(/postAction\('reject'/);
		expect(src).toMatch(/postAction\('hold'/);
		expect(src).toMatch(/postAction\('ack'/);
		expect(src).toMatch(/postAction\('correct'/);
		expect(src).toMatch(/if \(overrides\) fields\.overrides = JSON\.stringify\(overrides\)/);
		expect(src).not.toMatch(/overrides:\s*''/);
	});

	it('고쳐서 반영 시트에 감시 가격·방향·손익분기·관심만 입력란이 없다', () => {
		const src = read('src/lib/components/queue/OverrideSheet.svelte');
		expect(src).not.toMatch(/bind:value=\{inputs\.(trigger|breakeven|watch)/);
		expect(src).not.toMatch(/inputs\.trigger_price|inputs\.breakeven|inputs\.watch_only/);
	});

	it('/approvals는 /portfolio#queue로 보낸다(G-3)', () => {
		expect(read('src/routes/approvals/+page.ts')).toMatch(/\/portfolio#queue/);
	});
});
